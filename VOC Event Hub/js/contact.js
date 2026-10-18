// Enquiry drafts stay in this browser; no organiser submission is performed.
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  const key = 'vosc_contact_draft';
  const fields = ['name', 'email', 'topic', 'message'];
  const topics = ['general', 'registration', 'schedule', 'accessibility'];
  const input = (field) => document.getElementById(`contact-${field}`);
  const status = document.getElementById('contact-status');
  const error = document.getElementById('contact-error');
  const readDraft = () => {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      const draft = JSON.parse(raw);
      if (!draft || !fields.every((field) => typeof draft[field] === 'string') || !topics.includes(draft.topic)) throw new Error();
      return draft;
    } catch (cause) { throw new Error('Your saved enquiry could not be read. Existing data has been kept. You can still download your entered enquiry.'); }
  };
  const showError = (message) => { error.textContent = message; error.hidden = false; status.hidden = true; };
  const values = () => Object.fromEntries(fields.map((field) => [field, input(field).value.trim()]));
  try {
    const draft = readDraft();
    if (draft) {
      fields.forEach((field) => { input(field).value = draft[field]; });
      status.textContent = 'Your saved enquiry draft has been restored. It has not been sent to organisers.';
      status.hidden = false;
    }
  } catch (cause) { showError(cause.message); }
  fields.forEach((field) => input(field).addEventListener('input', () => {
    setFieldError(input(field), ''); status.hidden = true; error.hidden = true;
  }));
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = values();
    const errors = {
      name: validateName(draft.name),
      email: validateEmail(draft.email),
      message: draft.message.length < 10 || draft.message.length > 2000 ? 'Please enter a question between 10 and 2,000 characters.' : '',
    };
    Object.entries(errors).forEach(([field, message]) => setFieldError(input(field), message));
    const invalid = Object.keys(errors).find((field) => errors[field]);
    if (invalid) { showError('Please check the highlighted fields.'); input(invalid).focus(); return; }
    if (!topics.includes(draft.topic)) { showError('Please select a topic from the list.'); input('topic').focus(); return; }
    try {
      readDraft(); // Never overwrite unreadable existing data.
      localStorage.setItem(key, JSON.stringify(draft));
    } catch (cause) { showError('Could not save your enquiry draft. Existing data and your entered details have been kept. You can download the enquiry text instead.'); return; }
    error.hidden = true;
    status.textContent = 'Enquiry draft saved on this device. It has not been sent to organisers.';
    status.hidden = false;
    document.getElementById('contact-announcement').textContent = status.textContent;
  });
  document.getElementById('download-enquiry').addEventListener('click', () => {
    const draft = values();
    const text = `VOSC Event Hub enquiry draft — NOT SENT\n\nName: ${draft.name}\nEmail: ${draft.email}\nTopic: ${draft.topic}\n\n${draft.message}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'VOSC-enquiry-draft.txt';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
