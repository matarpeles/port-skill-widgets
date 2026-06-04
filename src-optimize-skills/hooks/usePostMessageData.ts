import { useEffect, useMemo, useState } from 'react';
import { usePortPluginData } from '@port-labs/plugins-sdk/react';

export const DEV_MOCK =
  process.env.NODE_ENV === 'development' && window.parent === window;

const MOCK_BASE_URL = 'https://api.getport.io';
const MOCK_TOKEN = 'dev-mock-token';

export const usePostMessageData = () => {
  const sdk = usePortPluginData();
  const [mockToken] = useState<string | null>(DEV_MOCK ? MOCK_TOKEN : null);
  const [mockBaseUrl] = useState<string | null>(DEV_MOCK ? MOCK_BASE_URL : null);

  const applyThemeCss = sdk.applyThemeCss;
  useEffect(() => {
    if (!DEV_MOCK) applyThemeCss();
  }, [applyThemeCss]);

  return useMemo(() => {
    if (DEV_MOCK) {
      return { portToken: mockToken, portApiBaseUrl: mockBaseUrl };
    }
    return {
      portToken: sdk.portToken,
      portApiBaseUrl: sdk.portApiBaseUrl,
    };
  }, [sdk, mockToken, mockBaseUrl]);
};
