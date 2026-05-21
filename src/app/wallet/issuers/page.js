import { WalletIssuerDirectory } from '@/components/WalletIssuerDirectory';
import {
	getIssuerClassifications,
	getRegisteredIssuers,
} from '@/lib/issuer-registry';

export default async function WalletIssuersPage() {
	const [issuers, classifications] = await Promise.all([
		getRegisteredIssuers(),
		getIssuerClassifications(),
	]);

	return (
		<WalletIssuerDirectory
			issuers={issuers}
			classifications={classifications.filter((item) => item.count > 0)}
		/>
	);
}
