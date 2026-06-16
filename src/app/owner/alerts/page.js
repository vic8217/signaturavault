import {
	AlertTriangle,
	BadgeCheck,
	Bell,
	FileClock,
	GraduationCap,
	ShieldAlert,
} from 'lucide-react';

const filters = ['All', 'Unread', 'Requests', 'Verification'];

const alerts = [
	{
		title: 'Document Verification Request',
		message: 'Your PRC License was requested by ABC Company.',
		time: '2m ago',
		icon: ShieldAlert,
		unread: true,
		tone: 'red',
	},
	{
		title: 'New Alert from Issuer',
		message: 'University of Example sent you an alert.',
		time: '1h ago',
		icon: GraduationCap,
		unread: true,
		tone: 'red',
	},
	{
		title: 'Document Expiring Soon',
		message: 'Your Barangay ID will expire on May 20, 2025.',
		time: '3h ago',
		icon: AlertTriangle,
		unread: false,
		tone: 'amber',
	},
	{
		title: 'Verification Completed',
		message: 'Your diploma was verified by XYZ Corp.',
		time: '5h ago',
		icon: BadgeCheck,
		unread: false,
		tone: 'emerald',
	},
	{
		title: 'New Document Available',
		message: 'Your certificate is now available from LGU Makati.',
		time: '1d ago',
		icon: FileClock,
		unread: false,
		tone: 'violet',
	},
	{
		title: 'Security Alert',
		message: 'New login detected on your account.',
		time: '2d ago',
		icon: Bell,
		unread: false,
		tone: 'red',
	},
];

const toneClasses = {
	amber: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
	emerald: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
	red: 'border-red-300/25 bg-red-500/10 text-red-200',
	violet: 'border-violet-300/25 bg-violet-400/10 text-violet-200',
};

export default function OwnerAlertsPage() {
	const unreadCount = alerts.filter((alert) => alert.unread).length;

	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<header className="flex items-end justify-between gap-4">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
						Signatura
					</p>
					<h1 className="mt-2 text-2xl font-black text-white">Alerts</h1>
				</div>
				<span className="rounded-full border border-red-300/30 bg-red-500/15 px-3 py-1 text-xs font-black text-red-100">
					{unreadCount} unread
				</span>
			</header>

			<div className="w-full overflow-x-auto [scrollbar-width:none]">
				<div className="flex min-w-max gap-2">
					{filters.map((filter, index) => (
						<button
							key={filter}
							type="button"
							className={`min-h-10 rounded-full border px-4 text-xs font-bold ${
								index === 0
									? 'border-red-400 bg-red-500 text-white'
									: 'border-white/10 bg-white/[0.04] text-slate-300'
							}`}>
							{filter}
						</button>
					))}
				</div>
			</div>

			<section className="grid gap-3">
				{alerts.map((alert) => {
					const Icon = alert.icon;
					return (
						<button
							key={alert.title}
							type="button"
							className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-red-400/50">
							<span
								className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${toneClasses[alert.tone]}`}>
								<Icon className="h-5 w-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-black text-white">
									{alert.title}
								</span>
								<span className="mt-1 block text-xs leading-5 text-slate-400">
									{alert.message}
								</span>
							</span>
							<span className="flex shrink-0 flex-col items-end gap-2">
								<span className="text-[0.68rem] font-semibold text-slate-500">
									{alert.time}
								</span>
								{alert.unread ? (
									<span className="h-2.5 w-2.5 rounded-full bg-red-400" />
								) : null}
							</span>
						</button>
					);
				})}
			</section>
		</div>
	);
}
