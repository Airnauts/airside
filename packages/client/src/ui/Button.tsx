// packages/client/src/ui/Button.tsx
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../lib/cn'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'link'
export type ButtonSize = 'sm' | 'md' | 'icon' | 'inline'

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant: ButtonVariant
  size: ButtonSize
}

const BASE =
  'air:inline-flex air:items-center air:justify-center air:font-semibold air:cursor-pointer air:transition-colors air:disabled:cursor-default'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'air:text-white air:bg-blue-600 air:border-0',
  outline: 'air:bg-white air:border air:border-gray-300 air:text-gray-600',
  ghost: 'air:bg-transparent air:border-0 air:text-gray-500',
  link: 'air:bg-transparent air:border-0 air:text-blue-600 air:font-medium air:hover:underline',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'air:px-3 air:py-1 air:text-xs air:rounded-md',
  md: 'air:px-4 air:py-2 air:text-sm air:rounded-full',
  icon: 'air:w-7 air:h-7 air:rounded-full',
  inline: 'air:p-0',
}

/** The widget's single button primitive. `variant` sets colour/border identity,
 *  `size` sets padding/text/radius; pass `className` for stateful or positional
 *  overrides (it is merged last and wins on conflicts). The `link` variant +
 *  `inline` size make a padding-less text affordance (colour/weight via `className`). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  )
})
