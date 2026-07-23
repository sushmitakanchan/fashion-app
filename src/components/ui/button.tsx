import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap touch-manipulation transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Hover darkens the blue rather than fading it: bg-primary/80 lightened
        // the fill against warm paper, which read as disabled.
        default:
          "bg-primary text-primary-foreground hover:bg-(--primary-hover)",
        outline:
          "border-border bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        // The 3D action button: a neon-pink face with a glossy top sheen and a
        // bevelled edge, extruded onto a lime base it sinks onto when pressed.
        // Constant in both themes (see --cta). The face gets its gloss from a
        // sheen layer over the flat --cta rather than a colour wash, so the neon
        // stays neon. The lime lip + drop shadow are the last two box-shadow
        // layers; the base variant's focus ring composes ahead of them, so a
        // focus outline still shows. `translate-y-px` is overridden to a 4px
        // sink; `motion-reduce` drops only the transition, keeping the state.
        cta: "text-cta-foreground rounded-full font-semibold bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_38%),linear-gradient(0deg,var(--cta),var(--cta))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-3px_4px_rgba(20,17,15,0.3),0_6px_0_0_var(--cta-base),0_13px_16px_-4px_rgba(20,17,15,0.32)] hover:brightness-105 active:not-aria-[haspopup]:translate-y-[4px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_3px_rgba(20,17,15,0.3),0_2px_0_0_var(--cta-base),0_5px_8px_-2px_rgba(20,17,15,0.3)] motion-reduce:transition-none",
        // The flat companion to `cta`: the same constant neon-pink action colour
        // and ink label, no 3D. For inline/persistent primaries (the header
        // sign-in, a toolbar's save) where the extruded button would be too
        // heavy — the action colour stays consistent, the weight doesn't.
        "cta-flat":
          "bg-cta text-cta-foreground rounded-full hover:brightness-105",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
