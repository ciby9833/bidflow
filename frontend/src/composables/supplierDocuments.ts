// A general supporting document is used until country-specific requirements are approved.
// This is a collection template, not a statement of local legal requirements.
const templates: Record<string, string[]> = {
  CN: ['business_license', 'legal_representative_id', 'bank_account_certificate'],
  ID: ['nib', 'npwp', 'akta_sk'],
};

export function buildSupplierDocuments(countryCode = '', existing: any[] = []): any[] {
  const types = templates[countryCode.toUpperCase()] ?? ['company_registration'];
  const empty = { textValue: '', fileName: '', fileUrl: '', objectKey: '', mimeType: '', fileSize: 0 };
  const required = types.map(docType => ({
    ...empty, docType, docLabel: docType, ...existing.find(doc => doc.docType === docType),
  }));
  // Changing country or loading a legacy record must not drop attachments outside the template.
  return [...required, ...existing.filter(doc => !types.includes(doc.docType) && (doc.fileUrl || doc.textValue || doc.objectKey))];
}
