// This file is deprecated and kept for backwards compatibility only.
// All functionality has been moved to server/sms-providers/signalwire-provider.ts
// Please use the SignalWireProvider class directly.

import type { AvailableNumber, SignalWireNumber } from "./sms-providers/types";

export { getOwnedNumbers, searchAvailableNumbers, purchasePhoneNumber, sendSMS } from "./sms-providers/signalwire-provider";
