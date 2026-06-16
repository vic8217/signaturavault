import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import {
	REGISTRATION_STATUSES,
	currentRegistrationStep,
} from '@/lib/registration-status';
import {
	findRegistrationSession,
	touchRegistrationSession,
} from '@/lib/registration-session';
import {
	assertSecureWebAuthnRequest,
	logSecurityEvent,
} from '@/lib/webauthn';

const ALLOWED_TRANSITIONS: Record<string, string> = {
	[REGISTRATION_STATUSES.PASSKEY_CREATED]:
		REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
	[REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED]:
		REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
};

const TRUSTED_DEVICE_READY_STEPS = new Set<string>([
	REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
	REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
	REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
]);

async function resolveRegistrationStep(user: {
	id: string;
	accountStatus?: string | null;
	trustLevel?: number | null;
}) {
	let currentStep = currentRegistrationStep(user);
	let resolvedUser = user;

	if (currentStep === REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION) {
		const credential = await prisma.webAuthnCredential.findFirst({
			where: { userId: user.id },
			orderBy: { createdAt: 'desc' },
		});
		if (credential) {
			resolvedUser = await prisma.user.update({
				where: { id: user.id },
				data: { accountStatus: REGISTRATION_STATUSES.PASSKEY_CREATED },
			});
			currentStep = REGISTRATION_STATUSES.PASSKEY_CREATED;
		}
	}

	return { user: resolvedUser, currentStep };
}

function conflictResponse(
	message: string,
	currentStep: string,
	hint: string,
) {
	return NextResponse.json(
		{
			error: message,
			currentStep,
			hint,
		},
		{ status: 409 },
	);
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const registrationSessionId = String(body.registrationSessionId || '').trim();
		const userId = String(body.userId || '').trim();
		const targetStep = String(body.targetStep || '').trim();

		if (!registrationSessionId && !userId) {
			return jsonError('registrationSessionId or userId is required', 400);
		}

		const session = await findRegistrationSession({
			registrationSessionId,
			userId,
			renewIfExpired: true,
		});
		if (!session?.userId) {
			return jsonError(
				'Registration session not found or expired. Refresh and resume setup with your Signatura ID.',
				404,
			);
		}

		const user = await prisma.user.findUnique({
			where: { id: session.userId },
		});
		if (!user) return jsonError('Registration account not found', 404);

		await touchRegistrationSession(session.id, session.userId);

		const { user: resolvedUser, currentStep } = await resolveRegistrationStep(user);

		if (
			targetStep === 'trusted_device' &&
			TRUSTED_DEVICE_READY_STEPS.has(currentStep)
		) {
			return Response.json({
				ok: true,
				user: userPublicIdentity(resolvedUser),
				currentStep,
				registrationSessionId: session.id,
			});
		}
		if (
			targetStep === 'recovery' &&
			currentStep === REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE
		) {
			return Response.json({
				ok: true,
				user: userPublicIdentity(resolvedUser),
				currentStep,
				registrationSessionId: session.id,
			});
		}

		if (
			targetStep === 'trusted_device' &&
			currentStep === REGISTRATION_STATUSES.PENDING_PASSKEY_CREATION
		) {
			return conflictResponse(
				'Create a passkey on this device before trusted device registration.',
				currentStep,
				'Tap Create passkey on this phone, approve the biometric or PIN prompt, then continue.',
			);
		}

		const nextStatus = ALLOWED_TRANSITIONS[currentStep];
		if (!nextStatus) {
			return conflictResponse(
				'Registration cannot advance from the current step.',
				currentStep,
				'Refresh the page to resume setup from the correct step.',
			);
		}

		if (
			targetStep === 'recovery' &&
			currentStep !== REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED
		) {
			return conflictResponse(
				'Trusted device must be registered before recovery phrase setup.',
				currentStep,
				'Complete trusted device registration on this phone first.',
			);
		}

		const updatedUser = await prisma.user.update({
			where: { id: resolvedUser.id },
			data: { accountStatus: nextStatus },
		});

		await logSecurityEvent(req, 'registration_step_advanced', user.id, {
			registrationSessionId: session.id,
			fromStep: currentStep,
			toStep: nextStatus,
			targetStep,
		});

		return Response.json({
			ok: true,
			user: userPublicIdentity(updatedUser),
			currentStep: nextStatus,
			registrationSessionId: session.id,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to advance registration'),
			400,
		);
	}
}
