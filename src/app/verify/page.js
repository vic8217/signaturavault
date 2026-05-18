export default function VerifyDocument() {
	return (
		<div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-6">
			<div className="w-full max-w-md">
				<div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-8 text-center">
					<div className="text-6xl mb-6">🔍</div>
					<h1 className="text-3xl font-bold mb-4">Verify Document</h1>
					<p className="text-slate-300 mb-8">
						Scan a QR code from any Signatura-issued document to verify its
						authenticity and revocation status.
					</p>

					<div className="space-y-4">
						<div className="rounded-xl bg-slate-900 p-6 border border-slate-600">
							<p className="text-sm text-slate-400 mb-3">
								Scan a QR code or paste a verification token:
							</p>
							<input
								type="text"
								placeholder="Paste verification token..."
								className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
							/>
						</div>

						<button className="w-full px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition">
							Verify Document
						</button>
					</div>

					<div className="mt-8 p-4 rounded-lg bg-slate-900/50 border border-slate-700 text-left text-sm">
						<p className="font-semibold text-slate-300 mb-2">
							What happens when you verify:
						</p>
						<ul className="space-y-2 text-slate-400 text-xs">
							<li>
								✓ Document authenticity is checked against issuer&apos;s
								signature
							</li>
							<li>✓ Revocation status is confirmed</li>
							<li>✓ Blockchain anchor is validated if available</li>
							<li>✓ Issuer details and issue date are displayed</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}
