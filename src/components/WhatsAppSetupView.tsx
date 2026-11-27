import React, { useEffect, useState } from 'react';
import { BellRing, Check, CheckCircle2, Copy, AlertTriangle, Send, RefreshCw } from 'lucide-react';
import type {
  AdminNotificationSettings,
  KnowledgeBaseConfig,
  WhatsAppConnectionStatus,
} from '../types/agent';
import { buildSystemPrompt } from '../utils/promptBuilder';

interface WhatsAppSetupViewProps {
  config: KnowledgeBaseConfig;
  status: WhatsAppConnectionStatus | null;
  onRefreshStatus: () => Promise<void>;
  onSavePhoneNumberId: (phoneNumberId: string, graphApiVersion?: string) => Promise<void>;
  onVerifyConnection: () => Promise<void>;
  onSaveAdminNotification: (enabled: boolean, phone: string) => Promise<void>;
  onTestAdminNotification: () => Promise<AdminNotificationSettings['lastAttempt']>;
  onTriggerTestIncoming: (phone: string, contactName: string, text: string) => Promise<void>;
  onNavigateInbox: () => void;
}

const GRAPH_VERSIONS = ['v27.0', 'v26.0', 'v25.0', 'v24.0', 'v23.0', 'v22.0', 'v21.0'];

export const WhatsAppSetupView: React.FC<WhatsAppSetupViewProps> = ({
  config,
  status,
  onRefreshStatus,
  onSavePhoneNumberId,
  onVerifyConnection,
  onSaveAdminNotification,
  onTestAdminNotification,
  onTriggerTestIncoming,
  onNavigateInbox,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [phoneIdInput, setPhoneIdInput] = useState(status?.activePhoneNumberId || '');
  const [graphVersion, setGraphVersion] = useState(status?.graphApiVersion || 'v25.0');
  const [savingPhoneId, setSavingPhoneId] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneIdFeedback, setPhoneIdFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [alertEnabled, setAlertEnabled] = useState(
    status?.adminNotification?.enabled ?? true
  );
  const [alertPhone, setAlertPhone] = useState(
    status?.adminNotification?.phone || '923229524271'
  );
  const [savingAlert, setSavingAlert] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [testPhone, setTestPhone] = useState('447700900123');
  const [testName, setTestName] = useState('Zainab Khan');
  const [testMessage, setTestMessage] = useState(
    'Assalam o alaikum, mujhe Master level Data Science coursework guidance chahiye. Next week deadline hai.'
  );
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (status?.activePhoneNumberId && !phoneIdInput) {
      setPhoneIdInput(status.activePhoneNumberId);
    }
    if (status?.graphApiVersion) {
      setGraphVersion(status.graphApiVersion);
    }
  }, [status?.activePhoneNumberId, status?.graphApiVersion, phoneIdInput]);

  useEffect(() => {
    if (status?.adminNotification) {
      setAlertEnabled(status.adminNotification.enabled);
      if (status.adminNotification.phone) {
        setAlertPhone(status.adminNotification.phone);
      }
    }
  }, [status?.adminNotification?.enabled, status?.adminNotification?.phone]);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '/api/whatsapp/webhook';

  const compiledPrompt = buildSystemPrompt(config);

  const handleCopy = async (text: string, which: 'url' | 'prompt') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      }
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSavePhoneId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPhoneId) return;
    setSavingPhoneId(true);
    setPhoneIdFeedback(null);
    try {
      await onSavePhoneNumberId(phoneIdInput.trim(), graphVersion);
      setPhoneIdFeedback({
        type: 'success',
        text: phoneIdInput.trim()
          ? 'Saved Phone Number ID and checked live Meta connection.'
          : 'Cleared override; using environment secret.',
      });
    } catch (err) {
      setPhoneIdFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save Phone Number ID.',
      });
    } finally {
      setSavingPhoneId(false);
    }
  };

  const handleVerifyLive = async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      await onVerifyConnection();
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveAlertSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAlert) return;
    setSavingAlert(true);
    setAlertFeedback(null);
    try {
      await onSaveAdminNotification(alertEnabled, alertPhone);
      setAlertFeedback({
        type: 'success',
        text: alertEnabled
          ? `WhatsApp alerts active — new texts will notify +${alertPhone.replace(/\D/g, '')}.`
          : 'WhatsApp alert forwarding paused.',
      });
    } catch (err) {
      setAlertFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save alert settings.',
      });
    } finally {
      setSavingAlert(false);
    }
  };

  const handleSendTestAlert = async () => {
    if (testingAlert) return;
    setTestingAlert(true);
    setAlertFeedback(null);
    try {
      await onSaveAdminNotification(alertEnabled, alertPhone);
      const result = await onTestAdminNotification();
      if (result?.status === 'sent') {
        setAlertFeedback({
          type: 'success',
          text: `Test WhatsApp alert sent to +${result.recipientPhone}.`,
        });
      } else if (result?.status === 'simulated') {
        setAlertFeedback({
          type: 'info',
          text: `Alert simulated for +${result.recipientPhone} (configure Meta token to send live).`,
        });
      } else {
        setAlertFeedback({
          type: 'error',
          text: result?.error || `Alert failed (${result?.status || 'unknown'}).`,
        });
      }
    } catch (err) {
      setAlertFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send test alert.',
      });
    } finally {
      setTestingAlert(false);
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim() || sendingTest) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      await onTriggerTestIncoming(testPhone, testName, testMessage);
      setTestResult('Processed inbound message through Gemini AI and logged reply in Live Inbox.');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test webhook failed.');
    } finally {
      setSendingTest(false);
    }
  };

  const secretReadinessItems = [
    {
      name: 'GEMINI_API_KEY',
      ready: Boolean(status?.hasGeminiKey),
      note: 'Managed in Settings > Secrets · Highest Flash: gemini-4-hydrogen (fallback: 3.8-flash → 3.6-flash → 3.1-flash-lite)',
    },
    {
      name: 'WHATSAPP_ACCESS_TOKEN',
      ready: Boolean(status?.hasAccessToken),
      note: 'Managed in Settings > Secrets · Meta API Setup / System User token',
    },
    {
      name: 'WHATSAPP_VERIFY_TOKEN',
      ready: Boolean(status?.hasVerifyToken),
      note: 'Managed in Settings > Secrets · Custom token for Meta Webhook verification',
    },
    {
      name: 'WHATSAPP_APP_SECRET',
      ready: Boolean(status?.hasAppSecret),
      note: 'Managed in Settings > Secrets · Optional HMAC signature verification',
    },
  ];

  const verification = status?.lastVerification;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Section 1: Connection Status & Webhook URL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h1 className="text-lg font-display font-semibold text-slate-900">
                WhatsApp Cloud API Webhook
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Configure your Meta Phone Number ID, verify live Graph API connectivity, and inspect server readiness.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void onRefreshStatus()}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => void handleVerifyLive()}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
                <span>{verifying ? 'Checking...' : 'Verify Live Connection'}</span>
              </button>
            </div>
          </div>

          {/* Live Meta Connection Verification Banner */}
          {verification && (
            <div
              className={`rounded-lg border px-4 py-3 text-xs ${
                verification.connected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold">
                  {verification.connected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Connected Successfully to Meta WhatsApp Cloud API</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                      <span>Meta Connection Check Failed</span>
                    </>
                  )}
                </div>
                <span className="text-[11px] opacity-75 tabular-nums shrink-0">
                  Checked {verification.checkedAt}
                </span>
              </div>

              {verification.connected ? (
                <p className="mt-1.5 text-emerald-900">
                  {[
                    verification.displayPhoneNumber
                      ? `WhatsApp Number: ${verification.displayPhoneNumber}`
                      : null,
                    verification.verifiedName
                      ? `Business: ${verification.verifiedName}`
                      : null,
                    verification.qualityRating
                      ? `Quality: ${verification.qualityRating}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Meta confirmed your Phone Number ID and Access Token are active.'}
                </p>
              ) : (
                <p className="mt-1.5 leading-relaxed">{verification.error}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Meta Webhook Callback URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 truncate">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(webhookUrl, 'url')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 shrink-0"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-slate-700 mb-2.5">
              Connection Settings &amp; Server Secrets Readiness
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {/* Inline Editable Row: WHATSAPP_PHONE_NUMBER_ID & Graph Version */}
              <form onSubmit={handleSavePhoneId} className="px-3.5 py-3 text-xs space-y-2.5 bg-slate-50/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono font-medium text-slate-900">
                      WHATSAPP_PHONE_NUMBER_ID
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      Numeric Phone Number ID from Meta API Setup (digits only, not +1 555...)
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1 font-medium shrink-0 ${
                      status?.hasPhoneNumberId && status?.phoneNumberIdValid
                        ? 'text-emerald-700'
                        : status?.phoneNumberIdWarning
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {status?.hasPhoneNumberId && status?.phoneNumberIdValid ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Configured</span>
                      </>
                    ) : status?.phoneNumberIdWarning ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Invalid format</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Not set</span>
                      </>
                    )}
                  </span>
                </div>

                {status?.phoneNumberIdWarning && (
                  <p className="text-red-700 font-medium leading-snug">
                    {status.phoneNumberIdWarning}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    id="wa-phone-number-id"
                    type="text"
                    inputMode="numeric"
                    value={phoneIdInput}
                    onChange={(e) => {
                      setPhoneIdInput(e.target.value);
                      setPhoneIdFeedback(null);
                    }}
                    placeholder="Enter numeric Phone Number ID (e.g. 1422786037592220)"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                  <select
                    aria-label="Meta Graph API Version"
                    value={graphVersion}
                    onChange={(e) => setGraphVersion(e.target.value)}
                    className="px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-emerald-700"
                  >
                    {GRAPH_VERSIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={savingPhoneId}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {savingPhoneId ? 'Saving...' : 'Save & Verify'}
                  </button>
                  {status?.phoneNumberIdSource === 'dashboard' && (
                    <button
                      type="button"
                      disabled={savingPhoneId}
                      onClick={async () => {
                        setSavingPhoneId(true);
                        setPhoneIdFeedback(null);
                        try {
                          await onSavePhoneNumberId('', graphVersion);
                          setPhoneIdInput('');
                          setPhoneIdFeedback({
                            type: 'success',
                            text: 'Removed saved Phone Number ID override.',
                          });
                        } catch (err) {
                          setPhoneIdFeedback({
                            type: 'error',
                            text:
                              err instanceof Error
                                ? err.message
                                : 'Unable to clear Phone Number ID.',
                          });
                        } finally {
                          setSavingPhoneId(false);
                        }
                      }}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {phoneIdFeedback && (
                  <p
                    className={`text-xs font-medium ${
                      phoneIdFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {phoneIdFeedback.text}
                  </p>
                )}
              </form>

              {/* Private Server Secrets (Read-only status — managed in Settings > Secrets) */}
              {secretReadinessItems.map((item) => {
                const hasWarning =
                  item.name === 'WHATSAPP_APP_SECRET' && Boolean(status?.appSecretFormatWarning);
                return (
                  <div
                    key={item.name}
                    className="px-3.5 py-2.5 flex flex-col gap-1.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-mono font-medium text-slate-900">{item.name}</p>
                        <p className="text-slate-500 mt-0.5">{item.note}</p>
                      </div>
                      <span
                        className={`flex items-center gap-1 font-medium shrink-0 ${
                          hasWarning
                            ? 'text-red-700'
                            : item.ready
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {hasWarning ? (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Invalid format</span>
                          </>
                        ) : item.ready ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Configured</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Not set</span>
                          </>
                        )}
                      </span>
                    </div>
                    {hasWarning && (
                      <p className="text-red-700 font-medium leading-snug">
                        {status?.appSecretFormatWarning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Private secret keys and access tokens stay strictly on the server and are edited in AI Studio <strong>Settings &gt; Secrets</strong> (or your VPS <code className="font-mono">.env</code> file).
            </p>
          </div>
        </div>

        {/* Right Column: Test Live Webhook Pipeline */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-display font-semibold text-slate-900">
            Test Real-Time Agent Pipeline
          </h2>
          <p className="text-xs text-slate-600 mt-1 mb-4">
            Simulates an inbound Meta WhatsApp message through the backend webhook handler, generates a Gemini reply, and updates Live Inbox.
          </p>

          <form onSubmit={handleTestWebhook} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Client Name
                </label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  External WhatsApp Phone
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="923229524271"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>
            {testPhone.replace(/\D/g, '') === '19178094906' && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                19178094906 is your own business number — outbound Meta send will be skipped automatically to avoid self-send errors.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Incoming WhatsApp Message
              </label>
              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <button
              type="submit"
              disabled={sendingTest || !testMessage.trim()}
              className="w-full px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingTest ? 'Running Webhook & Gemini...' : 'Run Inbound Webhook Test'}</span>
            </button>
          </form>

          {testResult && (
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 space-y-2">
              <p>{testResult}</p>
              <button
                type="button"
                onClick={onNavigateInbox}
                className="font-medium text-[#075E54] underline underline-offset-2"
              >
                Open Live Inbox to inspect thread
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 1.25: Admin WhatsApp Notification Forwarding */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4 text-[#075E54]" />
            </div>
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-900">
                WhatsApp Alert on New Incoming Texts
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Automatically sends a WhatsApp notification (sender name, number, and message preview) to your coordinator phone whenever a student texts in.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-800">
            <input
              type="checkbox"
              checked={alertEnabled}
              onChange={(e) => {
                setAlertEnabled(e.target.checked);
                setAlertFeedback(null);
              }}
              className="w-4 h-4 accent-[#075E54] rounded"
            />
            <span>{alertEnabled ? 'Alerts Enabled' : 'Alerts Paused'}</span>
          </label>
        </div>

        <form onSubmit={handleSaveAlertSettings} className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="admin-alert-phone"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Notification Recipient WhatsApp Number (country code + digits)
              </label>
              <input
                id="admin-alert-phone"
                type="text"
                inputMode="tel"
                value={alertPhone}
                onChange={(e) => {
                  setAlertPhone(e.target.value);
                  setAlertFeedback(null);
                }}
                placeholder="923229524271"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={savingAlert}
                className="px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {savingAlert ? 'Saving...' : 'Save Alert Number'}
              </button>
              <button
                type="button"
                disabled={testingAlert || savingAlert}
                onClick={() => void handleSendTestAlert()}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {testingAlert ? 'Sending Alert...' : 'Send Test Alert'}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Note: Meta requires an active 24-hour session to send free-form text alerts — send one quick message from <code className="font-mono">+{alertPhone.replace(/\D/g, '') || '923229524271'}</code> to your business WhatsApp number (<code className="font-mono">+1 917-809-4906</code>) if Meta reports a 24h window error. Messages sent from the alert number itself are not echoed back to avoid loops.
          </p>

          {alertFeedback && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                alertFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : alertFeedback.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              {alertFeedback.text}
            </div>
          )}

          {status?.adminNotification?.lastAttempt && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-slate-900">Last Alert: </span>
                <span>
                  {status.adminNotification.lastAttempt.status === 'sent'
                    ? `Sent to +${status.adminNotification.lastAttempt.recipientPhone}`
                    : status.adminNotification.lastAttempt.status === 'simulated'
                    ? `Simulated for +${status.adminNotification.lastAttempt.recipientPhone}`
                    : status.adminNotification.lastAttempt.status === 'skipped_same_number'
                    ? `Skipped (sender is the alert number +${status.adminNotification.lastAttempt.recipientPhone})`
                    : `Failed: ${status.adminNotification.lastAttempt.error || 'Unknown error'}`}
                </span>
                <span className="text-slate-500">
                  {' '}
                  · triggered by {status.adminNotification.lastAttempt.fromName} (+
                  {status.adminNotification.lastAttempt.fromPhone})
                </span>
              </div>
              <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                {status.adminNotification.lastAttempt.at}
              </span>
            </div>
          )}
        </form>
      </div>

      {/* Section 1.5: Recent Incoming Meta Webhook Traffic */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Recent Incoming Meta Webhook Traffic
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Shows live requests sent by Meta to <code className="font-mono">/api/whatsapp/webhook</code> so you can confirm whether real WhatsApp messages are reaching this server.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefreshStatus()}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            Refresh Traffic
          </button>
        </div>

        {status?.recentWebhookEvents?.[0]?.event === 'signature_mismatch' && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>Meta IS reaching your server, but WHATSAPP_APP_SECRET does not match!</span>
            </p>
            <p className="leading-relaxed">
              Your real WhatsApp messages are arriving from Meta and getting rejected with HTTP 403. Open <strong>Meta for Developers → App Settings → Basic → App Secret</strong> (click <em>Show</em>), copy the exact 32-character App Secret into AI Studio <strong>Settings → Secrets → WHATSAPP_APP_SECRET</strong> (or leave it empty temporarily to test), then re-publish.
            </p>
          </div>
        )}

        {!status?.recentWebhookEvents || status.recentWebhookEvents.length === 0 ? (
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3.5 text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-900">
              No incoming Meta webhook requests recorded yet on this server.
            </p>
            <p className="text-slate-600 leading-relaxed">
              If you already sent a real WhatsApp message to <strong className="font-mono">+1 917-809-4906</strong> and nothing appears here, check Meta Developer Portal:
              (1) Callback URL must be your published public URL (not the preview URL),
              (2) the <code className="font-mono">messages</code> webhook field must be subscribed, and
              (3) your Meta App must be in <strong>Live</strong> mode for non-admin phones.
            </p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-[240px] overflow-y-auto">
            {status.recentWebhookEvents.map((ev) => (
              <div
                key={ev.id}
                className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {ev.timestamp}
                  </span>
                  <span className="font-mono font-semibold text-slate-800 shrink-0">
                    {ev.method} {ev.status}
                  </span>
                  <span
                    className={`font-medium truncate ${
                      ev.status >= 400
                        ? 'text-red-700'
                        : ev.event === 'messages_received' || ev.event === 'verify_ok'
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {ev.detail}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 shrink-0">
                  {ev.event}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Hosting & Meta Setup Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-display font-semibold text-slate-900">
            Do You Need a VPS? Hosting Options
          </h2>
          <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-semibold text-slate-900">
                Option 1: Managed Cloud / Shared App URL (No VPS Needed)
              </p>
              <p className="mt-1">
                Meta WhatsApp Cloud API only requires a 24/7 public HTTPS URL for your webhook. You can deploy this Node.js app directly on Cloud Run, Railway, or Render with zero server administration.
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-semibold text-slate-900">
                Option 2: VPS (Recommended for Persistent Local Disk & Zero Cold Starts)
              </p>
              <p className="mt-1">
                A small VPS ($5–$10/mo Ubuntu + Node.js + PM2 + Nginx/Caddy SSL) keeps conversation history (`data/store.json`), SSE connections, and WhatsApp webhook responses instant 24/7 with no serverless cold-start resets.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              5-Step Meta Cloud API Connection
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
              <li>Create a Business App in Meta for Developers and add the WhatsApp product.</li>
              <li>Copy your Phone Number ID and generate a permanent System User Access Token in Business Settings.</li>
              <li>Add <code className="font-mono">WHATSAPP_ACCESS_TOKEN</code>, <code className="font-mono">WHATSAPP_PHONE_NUMBER_ID</code>, <code className="font-mono">WHATSAPP_VERIFY_TOKEN</code>, and <code className="font-mono">WHATSAPP_APP_SECRET</code> to Secrets (or VPS <code className="font-mono">.env</code>).</li>
              <li>In Meta Dashboard &gt; WhatsApp &gt; Configuration, paste the Callback URL above and your Verify Token.</li>
              <li>Click Verify and Save, then subscribe to the <code className="font-mono">messages</code> webhook field.</li>
            </ol>
          </div>
        </div>

        {/* Compiled Prompt Export */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-900">
                Active Agent System Prompt
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Used live by both the WhatsApp Cloud webhook and Simulator.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(compiledPrompt, 'prompt')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 shrink-0"
            >
              {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPrompt ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="p-4 text-[11px] font-mono text-slate-800 bg-slate-50/70 whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto">
            {compiledPrompt}
          </pre>
        </div>
      </div>
    </div>
  );
};
