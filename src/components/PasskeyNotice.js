function PasskeyNotice() {
	return (
		<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-50">
			<p className="font-semibold">
				Register this device with biometric/passkey security.
			</p>
			<p className="mt-2 text-red-100/90">
				Your fingerprint or face data never leaves your device. Signatura only
				receives a cryptographic proof that this trusted device approved the
				login.
			</p>
		</div>
	);
}

export { PasskeyNotice };
