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
  'cmnt:inline-flex cmnt:items-center cmnt:justify-center cmnt:font-semibold cmnt:cursor-pointer cmnt:transition-colors cmnt:disabled:cursor-default'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'cmnt:text-white cmnt:bg-blue-600 cmnt:border-0',
  outline: 'cmnt:bg-white cmnt:border cmnt:border-gray-300 cmnt:text-gray-600',
  ghost: 'cmnt:bg-transparent cmnt:border-0 cmnt:text-gray-500',
  link: 'cmnt:bg-transparent cmnt:border-0 cmnt:text-blue-600 cmnt:font-medium cmnt:hover:underline',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'cmnt:px-3 cmnt:py-1 cmnt:text-xs cmnt:rounded-md',
  md: 'cmnt:px-4 cmnt:py-2 cmnt:text-sm cmnt:rounded-full',
  icon: 'cmnt:w-7 cmnt:h-7 cmnt:rounded-full',
  inline: 'cmnt:p-0',
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
