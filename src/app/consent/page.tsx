import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureHavenxSigClient } from '@/lib/signatura-oauth';
import { requireSession } from '@/lib/session';

type ConsentPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function queryValue(
	params: Record<string, string | string[] | undefined>,
	key: string,
) {
	const value = params[key];
	return Array.isArray(value) ? value[0] || '' : value || '';
}

function hiddenInput(name: string, value: string) {
	return <input key={name} type="hidden" name={name} value={value} />;
}

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
	const params = await searchParams;
	const fields = {
		client_id: queryValue(params, 'client_id'),
		redirect_uri: queryValue(params, 'redirect_uri'),
		scope: queryValue(params, 'scope'),
		state: queryValue(params, 'state'),
		code_challenge: queryValue(params, 'code_challenge'),
		code_challenge_method: queryValue(params, 'code_challenge_method'),
	};
	const nextQuery = new URLSearchParams();
	for (const [key, value] of Object.entries(fields)) {
		if (value) nextQuery.set(key, value);
	}

	const session = await requireSession();
	if (!session?.userId) {
		redirect(`/login?next=${encodeURIComponent(`/consent?${nextQuery}`)}`);
	}

	const client = await ensureHavenxSigClient();
	const requestValid =
		client.clientId === fields.client_id &&
		client.status === 'active' &&
		client.redirectUris.includes(fields.redirect_uri) &&
		Boolean(fields.state) &&
		Boolean(fields.code_challenge) &&
		['S256', 'plain'].includes(fields.code_challenge_method);

	return (
		<main className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
			<div className="mx-auto flex w-full max-w-3xl items-center justify-between">
				<Link href="/" className="text-sm font-bold uppercase text-red-200">
					Signatura
				</Link>
				<span className="text-sm text-zinc-400">Identity consent</span>
			</div>

			<section className="mx-auto mt-10 w-full max-w-3xl">
				<div className="border-b border-white/10 pb-6">
					<p className="text-sm font-semibold uppercase text-red-300">
						Trusted sharing request
					</p>
					<h1 className="mt-3 text-3xl font-black sm:text-4xl">
						HavenxSig is requesting permission to verify your Signatura
						identity.
					</h1>
				</div>

				{requestValid ? (
					<div className="mt-8 grid gap-8 md:grid-cols-[1fr_240px]">
						<div>
							<h2 className="text-lg font-bold">Data shared</h2>
							<ul className="mt-4 grid gap-3 text-sm text-zinc-200">
								<li>Signatura User ID</li>
								<li>verified identity status</li>
								<li>trusted device status</li>
								<li>consent reference</li>
								<li>resident verification claim, if available</li>
							</ul>
						</div>

						<form
							action="/api/oauth/consent"
							method="post"
							className="grid content-start gap-3">
							{Object.entries(fields).map(([name, value]) =>
								hiddenInput(name, value),
							)}
							<button
								type="submit"
								name="action"
								value="approve"
								className="rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
								Approve
							</button>
							<button
								type="submit"
								name="action"
								value="decline"
								className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-zinc-100 transition hover:bg-white/10">
								Decline
							</button>
						</form>
					</div>
				) : (
					<div className="mt-8 border border-red-400/40 bg-red-950/30 p-5 text-sm text-red-100">
						This authorization request is invalid or the redirect URI is not
						allowed for HavenxSig.
					</div>
				)}
			</section>
		</main>
	);
}
