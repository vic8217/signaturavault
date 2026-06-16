import Link from 'next/link';
import Image from 'next/image';
import { SignaturaAuthorizeForm } from '@/components/SignaturaAuthorizeForm';
import {
	isAllowedAccuraAuthorizationSource,
	isAllowedAccuraClientId,
	isAllowedAccuraRolePrefix,
	normalizeAccuraAuthorizationSource,
	normalizeAccuraClientId,
} from '@/lib/accuraAuthorization';
import { normalizeExternalReturnUrl } from '@/lib/externalReturnUrl';
import { normalizeSignaturaId } from '@/lib/identity';
import { normalizeAccuraRolePrefix } from '@/lib/registrationSource';

function firstParam(value) {
	if (Array.isArray(value)) return value[0] || '';
	return String(value || '');
}

export default async function SignaturaAuthorizePage({ searchParams }) {
	const params = await searchParams;
	const clientId = normalizeAccuraClientId(firstParam(params?.clientId));
	const source = normalizeAccuraAuthorizationSource(firstParam(params?.source));
	const returnUrl = normalizeExternalReturnUrl(firstParam(params?.returnUrl));
	const expectedSignaturaId = normalizeSignaturaId(
		firstParam(params?.expectedSignaturaId),
	);
	const rolePrefix = normalizeAccuraRolePrefix(firstParam(params?.rolePrefix));
	const state = firstParam(params?.state).trim();
	console.info('[signatura-authorize] request', {
		clientId,
		source,
		rolePrefix,
		returnUrl,
		expectedSignaturaId,
	});
	const error =
		!isAllowedAccuraClientId(clientId)
			? 'This authorization request is not for ACCURA.'
		: !returnUrl
			? 'The ACCURA return URL is not allowed.'
			: !isAllowedAccuraAuthorizationSource(source)
				? 'This authorization source is not supported.'
				: !isAllowedAccuraRolePrefix(rolePrefix)
					? 'This ACCURA role prefix is not supported.'
				: !expectedSignaturaId
					? 'ACCURA must provide the expected Signatura ID.'
					: '';

	return (
		<main className="relative min-h-screen overflow-x-hidden bg-[#02070d] px-3 py-8 text-white sm:px-6 lg:px-8">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(255,47,47,0.24),transparent_34%),radial-gradient(circle_at_8%_88%,rgba(20,68,97,0.24),transparent_32%),linear-gradient(145deg,#01050a_0%,#06101a_46%,#08070d_100%)]" />
			<div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-5xl flex-col">
				<div className="hidden items-center lg:flex">
					<Link href="/" className="text-sm font-bold uppercase text-white">
						Signatura
					</Link>
				</div>

				<section className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-8 py-7 sm:gap-10 lg:py-10">
					<div className="text-center">
						<Image
							src="/signatura-logo.png"
							alt="Signatura"
							width={184}
							height={184}
							priority
							className="mx-auto h-32 w-32 object-contain drop-shadow-[0_22px_42px_rgba(0,0,0,0.45)] sm:h-40 sm:w-40"
						/>
						<h1 className="mt-5 text-3xl font-black uppercase text-white sm:text-4xl">
							Signatura
						</h1>
						<p className="mt-2 text-sm font-bold uppercase text-red-400 sm:text-base">
							ACCURA Login Authorization
						</p>
					</div>

					<div className="mx-auto w-full min-w-0 max-w-2xl overflow-hidden rounded-lg border border-red-500/80 bg-[#020912]/86 text-white shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_42px_rgba(239,68,68,0.13)] backdrop-blur-xl">
						{error ? (
							<div className="p-4 sm:p-10 lg:p-12">
								<p className="text-2xl font-black sm:text-4xl">
									Authorization unavailable
								</p>
								<p className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
									{error}
								</p>
							</div>
						) : (
								<SignaturaAuthorizeForm
									clientId={clientId}
									returnUrl={returnUrl}
									expectedSignaturaId={expectedSignaturaId}
									rolePrefix={rolePrefix}
									source={source}
									state={state}
								/>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}
