import { NextResponse } from 'next/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	HAVENXSIG_CLIENT_ID,
	allowedHavenxSigOrigins,
	allowedHavenxSigRedirectUris,
	ensureHavenxSigClient,
	randomToken,
} from '@/lib/signatura-oauth';
import { prisma } from '@/lib/prisma';

export async function POST() {
	try {
		const existing = await prisma.apiClient.findUnique({
			where: { clientId: HAVENXSIG_CLIENT_ID },
		});

		if (existing) {
			return NextResponse.json({
				client: {
					name: existing.name,
					clientId: existing.clientId,
					redirectUris: existing.redirectUris,
					allowedOrigins: existing.allowedOrigins,
					status: existing.status,
				},
				alreadyRegistered: true,
			});
		}

		const client = await prisma.apiClient.create({
			data: {
				name: 'HavenxSig',
				clientId: HAVENXSIG_CLIENT_ID,
				clientSecret:
					process.env.HAVENXSIG_CLIENT_SECRET ||
					randomToken('havenxsig_secret'),
				redirectUris: allowedHavenxSigRedirectUris(),
				allowedOrigins: allowedHavenxSigOrigins(),
				status: 'active',
			},
		});

		return NextResponse.json(
			{
				client: {
					name: client.name,
					clientId: client.clientId,
					redirectUris: client.redirectUris,
					allowedOrigins: client.allowedOrigins,
					status: client.status,
				},
			},
			{ status: 201 },
		);
	} catch (error) {
		await ensureHavenxSigClient().catch(() => null);
		return jsonError(
			safeApiErrorMessage(error, 'Unable to register HavenxSig client'),
			400,
		);
	}
}
