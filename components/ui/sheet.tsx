'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  'fixed z-50 gap-4 overflow-y-auto bg-card shadow-lifted transition ease-in-out data-[state=open]:animate-fade-in',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 max-h-[90dvh] rounded-b-3xl border-b',
        bottom: 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl border-t safe-bottom',
        start: 'inset-y-0 start-0 h-full w-11/12 max-w-sm border-e',
        end: 'inset-y-0 end-0 h-full w-11/12 max-w-sm border-s',
      },
    },
    defaultVariants: { side: 'end' },
  },
);

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>
>(({ side, className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-fade-in" />
    <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), 'p-5', className)} {...props}>
      {children}
      <DialogPrimitive.Close
        className="absolute end-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        aria-label="סגירה"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1 pe-8 text-start', className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
