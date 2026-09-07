import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="dialog-overlay" />
        <Primitive.Content className={`dialog-content ${wide ? 'dialog-wide' : ''}`}>
          <div className="dialog-heading">
            <div>
              <Primitive.Title>{title}</Primitive.Title>
              <Primitive.Description>
                {description ?? '查看详情并管理你的课程。'}
              </Primitive.Description>
            </div>
            <Primitive.Close className="icon-button" aria-label="关闭">
              <X size={20} />
            </Primitive.Close>
          </div>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
