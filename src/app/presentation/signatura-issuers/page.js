import { headers } from 'next/headers';
import Image from 'next/image';
import { PresentationViewer } from '@/components/PresentationViewer';
import {
	SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	SIGNATURA_ISSUERS_SLIDE_COUNT,
	validatePresentationAccess,
} from '@/lib/presentation-access';

function invalidMessage() {
	return (
		<main className="grid min-h-screen place-items-center bg-[#030A23] px-4 text-white">
			<section className="w-full max-w-lg rounded-xl border border-white/10 bg-white/4 p-8 text-center shadow-2xl shadow-black/40">
				<Image
					src="/signatura-logo.png"
					alt="Signatura logo"
					width={52}
					height={61}
					className="mx-auto h-14 w-auto object-contain"
					priority
				/>
				<p className="mt-6 text-sm font-bold uppercase tracking-[0.22em] text-[#E31E3B]">
					Signatura
				</p>
				<h1 className="mt-3 text-2xl font-black text-white">
					Presentation link expired or invalid.
				</h1>
			</section>
		</main>
	);
}

export default async function SignaturaIssuersPresentationPage({ searchParams }) {
	const params = await searchParams;
	const token = typeof params?.token === 'string' ? params.token : '';
	const headerStore = await headers();
	const result = await validatePresentationAccess({
		token,
		presentationSlug: SIGNATURA_ISSUERS_PRESENTATION_SLUG,
		req: { headers: headerStore },
		incrementView: true,
	});

	if (!result.ok) {
		return invalidMessage();
	}

	const slides = Array.from(
		{ length: SIGNATURA_ISSUERS_SLIDE_COUNT },
		(_, index) => {
			const number = String(index + 1).padStart(2, '0');
			return {
				src: `/presentations/signatura-issuers/slide-${number}.png`,
				alt: `Signatura issuers presentation slide ${index + 1}`,
			};
		},
	);

	return <PresentationViewer slides={slides} title="Issuer Presentation" />;
}
