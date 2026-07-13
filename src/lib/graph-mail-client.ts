// Microsoft Graph sendMail wrapper — OAuth2 client-credentials flow.
// Kopieer van Karpi-ERP: supabase/functions/_shared/graph-mail-client.ts
// Auth: Entra ID app-registratie met API-permissie Mail.Send (application, admin-consent).

export interface GraphMailAttachment {
  filename: string
  content: Uint8Array
  contentType?: string
}

export interface GraphMailSendInput {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Mailbox waar vandaan verstuurd wordt, bv. 'facturen@karpi.nl'. */
  from: string
  /** Eén of meer ontvangers. Een klant-e-mailveld kan er meerdere bevatten (zie email-recipients.ts). */
  to: string | string[]
  replyTo?: string
  /** Optionele BCC-ontvanger (bv. een interne kopie bij een ICL-verzending). */
  bcc?: string
  subject: string
  html: string
  attachments?: GraphMailAttachment[]
}

async function getAccessToken(
  input: Pick<GraphMailSendInput, "tenantId" | "clientId" | "clientSecret">,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { error_description?: string }).error_description ??
      `Graph token-fout ${res.status}`;
    throw new Error(msg);
  }

  return (json as { access_token: string }).access_token;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function sendFactuurEmail(
  input: GraphMailSendInput,
): Promise<void> {
  const token = await getAccessToken(input);

  const attachments = (input.attachments ?? []).map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.filename,
    contentType: a.contentType ?? "application/pdf",
    contentBytes: base64Encode(a.content),
  }));

  const message = {
    subject: input.subject,
    body: { contentType: "HTML", content: input.html },
    toRecipients: (Array.isArray(input.to) ? input.to : [input.to]).map((address) => ({
      emailAddress: { address },
    })),
    replyTo: input.replyTo
      ? [{ emailAddress: { address: input.replyTo } }]
      : undefined,
    bccRecipients: input.bcc
      ? [{ emailAddress: { address: input.bcc } }]
      : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const msg =
      (json as { error?: { message?: string } }).error?.message ??
      `Graph sendMail-fout ${res.status}`;
    throw new Error(msg);
  }
}
