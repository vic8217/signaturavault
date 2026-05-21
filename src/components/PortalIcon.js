export function PortalIcon({ name, className = 'h-5 w-5' }) {
	const common = {
		className,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.8,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		'aria-hidden': 'true',
	};

	const icons = {
		api: (
			<svg {...common}>
				<path d="M4 17 9 7" />
				<path d="m15 7 5 10" />
				<path d="M9 17h6" />
				<path d="M10 14h4" />
			</svg>
		),
		audit: (
			<svg {...common}>
				<path d="M9 5h10v14H5V9l4-4Z" />
				<path d="M9 5v4H5" />
				<path d="M9 13h6" />
				<path d="M9 16h4" />
			</svg>
		),
		bank: (
			<svg {...common}>
				<path d="m12 3 8 5H4l8-5Z" />
				<path d="M5 10h14" />
				<path d="M7 10v8" />
				<path d="M12 10v8" />
				<path d="M17 10v8" />
				<path d="M4 21h16" />
			</svg>
		),
		check: (
			<svg {...common}>
				<path d="m5 12 4 4L19 6" />
			</svg>
		),
		dashboard: (
			<svg {...common}>
				<rect width="7" height="7" x="4" y="4" rx="1.5" />
				<rect width="7" height="7" x="13" y="4" rx="1.5" />
				<rect width="7" height="7" x="4" y="13" rx="1.5" />
				<rect width="7" height="7" x="13" y="13" rx="1.5" />
			</svg>
		),
		document: (
			<svg {...common}>
				<path d="M7 3h7l4 4v14H7V3Z" />
				<path d="M14 3v5h4" />
				<path d="M10 13h5" />
				<path d="M10 16h5" />
			</svg>
		),
		identity: (
			<svg {...common}>
				<circle cx="12" cy="8" r="3" />
				<path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
			</svg>
		),
		lock: (
			<svg {...common}>
				<rect width="14" height="10" x="5" y="11" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
			</svg>
		),
		mic: (
			<svg {...common}>
				<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
				<path d="M5 10v2a7 7 0 0 0 14 0v-2" />
				<path d="M12 19v3" />
				<path d="M8 22h8" />
			</svg>
		),
		qr: (
			<svg {...common}>
				<rect width="5" height="5" x="4" y="4" rx="1" />
				<rect width="5" height="5" x="15" y="4" rx="1" />
				<rect width="5" height="5" x="4" y="15" rx="1" />
				<path d="M15 15h2v2h-2z" />
				<path d="M20 15v5h-5" />
			</svg>
		),
		more: (
			<svg {...common}>
				<circle cx="5" cy="12" r="1.5" />
				<circle cx="12" cy="12" r="1.5" />
				<circle cx="19" cy="12" r="1.5" />
			</svg>
		),
		scanner: (
			<svg {...common}>
				<path d="M4 8V5a1 1 0 0 1 1-1h3" />
				<path d="M16 4h3a1 1 0 0 1 1 1v3" />
				<path d="M20 16v3a1 1 0 0 1-1 1h-3" />
				<path d="M8 20H5a1 1 0 0 1-1-1v-3" />
				<path d="M7 12h10" />
				<rect width="6" height="6" x="9" y="9" rx="1.5" />
			</svg>
		),
		shield: (
			<svg {...common}>
				<path d="M12 3 19 6v5.2c0 4.2-2.8 7.6-7 9.8-4.2-2.2-7-5.6-7-9.8V6l7-3Z" />
				<path d="m9.2 12.2 1.8 1.8 4-4.2" />
			</svg>
		),
		system: (
			<svg {...common}>
				<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
				<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.3l-.5.2a1.7 1.7 0 0 0-1 1.5V22h-4v-.3a1.7 1.7 0 0 0-1-1.5l-.5-.2a1.7 1.7 0 0 0-1.9.3l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 5 15.1l-.1-.5a1.7 1.7 0 0 0-1.3-1.2L3.3 13V9l.3-.1a1.7 1.7 0 0 0 1.3-1.2l.1-.5a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9.3l.5-.2A1.7 1.7 0 0 0 10.2.5V.2h4v.3a1.7 1.7 0 0 0 1 1.5l.5.2a1.7 1.7 0 0 0 1.9-.3l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.5a1.7 1.7 0 0 0 1.3 1.2l.3.1v4l-.3.1a1.7 1.7 0 0 0-1.3 1.2l-.1.5Z" />
			</svg>
		),
		template: (
			<svg {...common}>
				<rect width="16" height="18" x="4" y="3" rx="2" />
				<path d="M8 8h8" />
				<path d="M8 12h8" />
				<path d="M8 16h4" />
			</svg>
		),
		upload: (
			<svg {...common}>
				<path d="M12 16V4" />
				<path d="m7 9 5-5 5 5" />
				<path d="M5 20h14" />
			</svg>
		),
	};

	return icons[name] ?? icons.shield;
}
