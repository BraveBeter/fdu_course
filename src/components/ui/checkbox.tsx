import * as Primitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`check-label ${disabled ? 'disabled' : ''}`}>
      <Primitive.Root
        className="checkbox"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
      >
        <Primitive.Indicator>
          <Check size={13} />
        </Primitive.Indicator>
      </Primitive.Root>
      <span>{label}</span>
    </label>
  );
}
