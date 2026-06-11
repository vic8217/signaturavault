'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoginModal } from './LoginModal';

function HomeLoginModalInner() {
	const searchParams = useSearchParams();
	const defaultOpen = searchParams.get('openLogin') === '1';

	return <LoginModal defaultOpen={defaultOpen} />;
}

function HomeLoginModal() {
	return (
		<Suspense fallback={<LoginModal />}>
			<HomeLoginModalInner />
		</Suspense>
	);
}

export { HomeLoginModal };
