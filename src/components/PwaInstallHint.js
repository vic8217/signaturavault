'use client';

import { useEffect, useState } from 'react';

export function PwaInstallHint() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			window.navigator.standalone === true;

		// eslint-disable-next-line react-hooks/set-state-in-effect
		setVisible(!isStandalone);
	}, []);

	if (!visible) return null;

	return (
		<p className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-slate-400">
			Install Signatura on your trusted device for faster approvals.
		</p>
	);
}
