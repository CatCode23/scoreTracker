import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand',
  secondary:
    'bg-white text-slate-900 border border-slate-400 hover:bg-slate-100 focus-visible:ring-slate-500',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700',
  success: 'bg-field text-white hover:bg-field-light focus-visible:ring-field',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-500',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }
>(function Button({ variant = 'primary', block, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-semibold',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    />
  );
});

export function Card({
  children,
  className,
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={cx('rounded-xl border border-slate-300 bg-white p-4 shadow-sm', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold leading-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-700">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const inputBase =
  'block w-full min-h-touch rounded-lg border border-slate-500 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(inputBase, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cx(inputBase, 'pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputBase, 'min-h-[88px]', className)} {...rest} />;
});

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-900">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-slate-600">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  id,
  description,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  description?: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-touch cursor-pointer items-start gap-3 rounded-lg border border-slate-400 bg-white p-3"
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-6 w-6 shrink-0 accent-brand"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        {description && <span className="block text-sm text-slate-700">{description}</span>}
      </span>
    </label>
  );
}

type Tone = 'info' | 'warn' | 'error' | 'success';
const tones: Record<Tone, string> = {
  info: 'border-blue-300 bg-blue-50 text-blue-950',
  warn: 'border-amber-400 bg-amber-50 text-amber-950',
  error: 'border-red-400 bg-red-50 text-red-950',
  success: 'border-green-400 bg-green-50 text-green-950',
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-lg border p-3', tones[tone], className)}
    >
      {title && <p className="font-bold">{title}</p>}
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'min-h-touch shrink-0 rounded-lg px-4 text-sm font-bold',
            value === t.id
              ? 'bg-brand text-white'
              : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-100',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
