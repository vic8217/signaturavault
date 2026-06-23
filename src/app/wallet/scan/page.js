import { QrCodeScanner } from '@/components/QrCodeScanner';

export default function WalletScanPage() {
	return (
		<div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
			<QrCodeScanner />
		</div>
	);
}
