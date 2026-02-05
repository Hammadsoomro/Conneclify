import type { ISmsProvider, SmsProviderConfig, AvailableNumber, OwnedNumber, PurchasedNumber, SendSmsParams, SmsResult, SearchNumbersParams } from "./types";

export class TelnyxProvider implements ISmsProvider {
  private apiKey: string;
  private baseUrl = "https://api.telnyx.com/v2";

  constructor(config: SmsProviderConfig) {
    const { apiKey } = config.credentials;
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Missing required credentials" };
    }

    const url = `${this.baseUrl}/phone_numbers?page[size]=1`;
    console.log(`Testing Telnyx connection to: ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.errors?.[0]?.detail || errorJson.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText.substring(0, 200);
        }
        console.error(`Telnyx test failed: ${errorMessage}`);
        return { 
          success: false, 
          error: `Authentication failed: ${errorMessage}` 
        };
      }

      console.log("Telnyx connection test successful");
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' 
        ? "Connection timeout - please try again" 
        : (err.message || "Connection failed");
      console.error(`Telnyx connection error: ${errorMsg}`, err);
      return { success: false, error: errorMsg };
    }
  }

  private getAuthHeader(): string {
    return `Bearer ${this.apiKey}`;
  }

  async getAvailableNumbers(searchParams?: SearchNumbersParams): Promise<AvailableNumber[]> {
    if (!this.isConfigured()) {
      throw new Error("Telnyx is not configured");
    }

    const country = searchParams?.country || "US";
    const params = new URLSearchParams({
      "filter[country_code]": country,
      "filter[limit]": "50",
      "filter[features][]": "sms",
    });
    if (searchParams?.areaCode) {
      params.append("filter[national_destination_code]", searchParams.areaCode);
    }
    if (searchParams?.region) {
      params.append("filter[administrative_area]", searchParams.region);
    }

    const response = await fetch(
      `${this.baseUrl}/available_phone_numbers?${params}`,
      {
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.detail || "Failed to fetch available numbers");
    }

    const data = await response.json();
    return (data.data || []).map((num: any) => {
      // Parse capabilities from Telnyx features array
      const caps: string[] = [];
      if (num.features?.includes("voice")) caps.push("voice");
      if (num.features?.includes("sms")) caps.push("sms");
      if (num.features?.includes("mms")) caps.push("mms");
      
      return {
        number: num.phone_number,
        friendlyName: num.phone_number,
        region: num.region_information?.[0]?.region_name,
        city: num.region_information?.[0]?.rate_center || "",
        capabilities: caps.length > 0 ? caps : ["sms", "voice"],
        monthlyRate: num.cost_information?.monthly_cost || "$1.00",
      };
    });
  }

  async getOwnedNumbers(): Promise<OwnedNumber[]> {
    if (!this.isConfigured()) {
      throw new Error("Telnyx is not configured");
    }

    const response = await fetch(
      `${this.baseUrl}/phone_numbers?page[size]=100`,
      {
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.detail || "Failed to fetch owned numbers");
    }

    const data = await response.json();
    return (data.data || []).map((num: any) => ({
      id: num.id,
      number: num.phone_number,
      friendlyName: num.phone_number,
      capabilities: ["sms", "voice"],
    }));
  }

  async purchaseNumber(number: string): Promise<PurchasedNumber> {
    if (!this.isConfigured()) {
      throw new Error("Telnyx is not configured");
    }

    const response = await fetch(
      `${this.baseUrl}/number_orders`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_numbers: [{ phone_number: number }],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.detail || "Failed to purchase number");
    }

    const data = await response.json();
    const phoneNumber = data.data?.phone_numbers?.[0];
    return {
      id: phoneNumber?.id || data.data?.id,
      number: phoneNumber?.phone_number || number,
      friendlyName: phoneNumber?.phone_number || number,
    };
  }

  async sendSms(params: SendSmsParams): Promise<SmsResult> {
    if (!this.isConfigured()) {
      throw new Error("Telnyx is not configured");
    }

    const messageBody: Record<string, any> = {
      to: params.to,
      from: params.from,
      text: params.body,
    };

    if (params.statusCallback) {
      messageBody.webhook_url = params.statusCallback;
    }

    const response = await fetch(
      `${this.baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.detail || "Failed to send SMS");
    }

    const data = await response.json();
    return {
      id: data.data.id,
      status: data.data.status || "sent",
      to: data.data.to?.[0]?.phone_number || params.to,
      from: data.data.from?.phone_number || params.from,
      body: data.data.text || params.body,
    };
  }
}
