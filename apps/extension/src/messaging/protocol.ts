import type { ColorTrace } from '@vcd/trace-model';

export type PickerResult =
  | { readonly ok: true; readonly trace: ColorTrace }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unsupported-page' | 'capture-failed'; readonly message?: string };

export interface ActivatePickerMessage {
  readonly type: 'colortrace/activate-picker';
  readonly property: 'color';
}

export const DEFAULT_PICKER_PROPERTY: ActivatePickerMessage['property'] = 'color';
