import { AlertTriangle } from 'lucide-react';

export const WarningBox = ({ text, onClick, className }: { text: string; onClick?: () => void; className?: string }) => {

	return (
		<div
			className={`
				flex items-center gap-2 px-3 py-1.5
				bg-void-orange/10 border border-void-orange/20 rounded-lg
				text-void-orange text-xs font-medium
				${onClick ? 'hover:bg-void-orange/20 transition-all duration-200 cursor-pointer active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-void-orange/50 min-h-[44px]' : ''}
				${className}
			`}
			onClick={onClick}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			<AlertTriangle size={14} className="shrink-0" />
			<span className="truncate">{text}</span>
		</div>
	);
}
