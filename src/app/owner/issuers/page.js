import {
	Building2,
	Factory,
	GraduationCap,
	HeartPulse,
	Landmark,
	MapPinHouse,
	Search,
	ShieldCheck,
	UsersRound,
} from 'lucide-react';

const industries = [
	{
		title: 'Educational Institutions',
		description: 'Universities, colleges, schools',
		count: 128,
		icon: GraduationCap,
	},
	{
		title: 'Barangays',
		description: 'Local barangays and communities',
		count: 1245,
		icon: MapPinHouse,
	},
	{
		title: 'LGU',
		description: 'Local Government Units',
		count: 215,
		icon: Landmark,
	},
	{
		title: 'Professional Organizations',
		description: 'Boards, associations, unions',
		count: 96,
		icon: ShieldCheck,
	},
	{
		title: 'Healthcare Institutions',
		description: 'Hospitals, clinics, health centers',
		count: 83,
		icon: HeartPulse,
	},
	{
		title: 'Government Agencies',
		description: 'National government agencies',
		count: 74,
		icon: Building2,
	},
	{
		title: 'Private Companies',
		description: 'Corporations and businesses',
		count: 53,
		icon: Factory,
	},
	{
		title: 'Others',
		description: 'Other organizations',
		count: 31,
		icon: UsersRound,
	},
];

function formatCount(value) {
	return new Intl.NumberFormat('en').format(value);
}

export default function OwnerIssuersPage() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<header className="space-y-2">
				<p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
					Signatura
				</p>
				<h1 className="text-2xl font-black text-white">Issuers</h1>
				<p className="text-sm leading-6 text-slate-300">
					Trusted partner industries that can issue credentials to your wallet.
				</p>
			</header>

			<div className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-slate-400">
				<Search className="h-5 w-5 text-red-300" />
				<span className="text-sm">Search issuers</span>
			</div>

			<section className="grid gap-3">
				{industries.map((industry) => {
					const Icon = industry.icon;
					return (
						<a
							key={industry.title}
							href={`/owner/issuers?industry=${encodeURIComponent(industry.title)}`}
							className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-red-400/50 hover:bg-white/[0.06]">
							<span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-red-400/25 bg-red-500/10 text-red-200">
								<Icon className="h-5 w-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-black text-white">
									{industry.title}
								</span>
								<span className="mt-1 block truncate text-xs text-slate-400">
									{industry.description}
								</span>
							</span>
							<span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-bold text-slate-300">
								{formatCount(industry.count)}
							</span>
						</a>
					);
				})}
			</section>
		</div>
	);
}
