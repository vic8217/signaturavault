import Link from 'next/link';
import { Activity, BadgeCheck, Clock, Send } from 'lucide-react';

const activityItems = [
	{
		title: 'Bachelor of Science in IT viewed',
		detail: 'University of Example credential verification',
		time: 'Today, 9:24 AM',
		icon: BadgeCheck,
	},
	{
		title: 'National ID shared',
		detail: 'Secure share link created',
		time: 'Yesterday, 4:12 PM',
		icon: Send,
	},
	{
		title: 'Wallet security check',
		detail: 'Trusted device and passkey verified',
		time: 'Jun 14, 2026',
		icon: Clock,
	},
];

export default function OwnerActivityPage() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
				<div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
					<Activity className="h-6 w-6" />
				</div>
				<h1 className="mt-5 text-2xl font-black text-white">Activity</h1>
				<p className="mt-2 text-sm leading-6 text-slate-300">
					Recent wallet sharing, viewing, and verification events appear here.
				</p>
			</section>

			<section className="grid gap-3">
				{activityItems.map((item) => {
					const Icon = item.icon;
					return (
						<div
							key={item.title}
							className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
							<span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200">
								<Icon className="h-5 w-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-black text-white">
									{item.title}
								</span>
								<span className="mt-1 block truncate text-xs text-slate-400">
									{item.detail}
								</span>
								<span className="mt-1 block text-xs text-slate-500">
									{item.time}
								</span>
							</span>
						</div>
					);
				})}
			</section>

			<Link
				href="/owner"
				className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white transition hover:border-red-400">
				Back to Wallet
			</Link>
		</div>
	);
}
