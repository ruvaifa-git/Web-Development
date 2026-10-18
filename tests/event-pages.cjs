// Dedicated Event Hub page checks. Uses only disposable browser data.
const assert = require('node:assert/strict');
module.exports = async ({ browser, event, fs, path, errors, check, artifacts }) => {
  const url = (name) => event.replace('index.html', name);
  async function fixture() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await context.route('https://**', (route) => route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(event);
    return { context, page };
  }
  async function fillEnquiry(page) {
    await page.locator('#contact-name').fill('Ada Student');
    await page.locator('#contact-email').fill('ada@example.com');
    await page.locator('#contact-topic').selectOption('accessibility');
    await page.locator('#contact-message').fill('Will the workshop venue have an accessible entrance?');
  }
  await check('Homepage Registration, My Registration and bottom Contact us open real pages', async () => {
    const { context, page } = await fixture();
    try {
      await page.locator('.nav-links a[href="registration.html"]').click();
      await page.waitForURL(/registration.html$/);
      assert.equal(await page.getByRole('heading', { name: 'Registration', exact: true }).count(), 1);
      await page.locator('.nav-links a[href="dashboard.html"]').click();
      await page.waitForURL(/dashboard.html$/);
      assert.equal(await page.locator('#dashboard-empty').isVisible(), true);
      await page.locator('.brand').click();
      await page.locator('#contact a').click();
      await page.waitForURL(/contact.html$/);
      assert.equal(await page.locator('#contact-form').isVisible(), true);
    } finally { await context.close(); }
  });
  await check('Registration opens a persistent dashboard and switches between saved participants', async () => {
    const { context, page } = await fixture();
    try {
      for (const [name, email] of [['Ada Student', 'ada@example.com'], ['Bob Student', 'bob@example.com']]) {
        await page.goto(url('registration.html'));
        if (await page.locator('#returning-new').isVisible()) await page.locator('#returning-new').click();
        await page.locator('#name').fill(name); await page.locator('#email').fill(email);
        await page.locator('#register-form button[type=submit]').click();
        await page.waitForURL(/dashboard.html\?ref=/);
        assert.equal(await page.locator('#confirm-name').textContent(), name);
        assert.match(await page.locator('#confirm-scope').textContent(), /Organisers have not received it/);
      }
      await page.reload();
      assert.equal(await page.locator('#registration-select option').count(), 2);
      await page.locator('#registration-select').selectOption({ index: 0 });
      assert.equal(await page.locator('#confirm-name').textContent(), 'Ada Student');
      await page.reload();
      assert.equal(await page.locator('#confirm-name').textContent(), 'Ada Student');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, 'registration-dashboard-desktop.png'), fullPage: true });
    } finally { await context.close(); }
  });
  await check('Contact validation associates errors and focuses the first invalid field', async () => {
    const { context, page } = await fixture();
    try {
      await page.goto(url('contact.html'));
      await page.locator('#contact-form button[type=submit]').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'contact-name');
      for (const field of ['name', 'email', 'message']) {
        assert.equal(await page.locator('#contact-' + field).getAttribute('aria-invalid'), 'true');
        assert.match(await page.locator('#contact-' + field).getAttribute('aria-describedby'), new RegExp('contact-' + field + '-error'));
      }
      await page.locator('#contact-name').fill('Ada Student');
      assert.equal(await page.locator('#contact-name').getAttribute('aria-invalid'), null);
    } finally { await context.close(); }
  });
  await check('Enquiries persist as local drafts and download as clearly unsent plain text', async () => {
    const { context, page } = await fixture();
    try {
      await page.goto(url('contact.html')); await fillEnquiry(page);
      await page.locator('#contact-form button[type=submit]').click();
      assert.match(await page.locator('#contact-status').textContent(), /has not been sent/);
      const saved = await page.evaluate(() => localStorage.getItem('vosc_contact_draft'));
      assert.match(saved, /accessible entrance/);
      await page.reload();
      assert.match(await page.locator('#contact-message').inputValue(), /accessible entrance/);
      assert.match(await page.locator('#contact-status').textContent(), /restored/);
      const promise = page.waitForEvent('download');
      await page.locator('#download-enquiry').click();
      const download = await promise;
      assert.equal(download.suggestedFilename(), 'VOSC-enquiry-draft.txt');
      const body = await fs.readFile(await download.path(), 'utf8');
      assert.match(body, /NOT SENT/); assert.match(body, /Ada Student/); assert.match(body, /accessible entrance/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, 'contact-desktop.png'), fullPage: true });
    } finally { await context.close(); }
  });
  await check('Contact save failures retain the saved draft and entered replacement', async () => {
    const { context, page } = await fixture();
    try {
      await page.goto(url('contact.html')); await fillEnquiry(page);
      await page.locator('#contact-form button[type=submit]').click();
      const saved = await page.evaluate(() => localStorage.getItem('vosc_contact_draft'));
      await page.locator('#contact-message').fill('This replacement question must survive a failed save.');
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'vosc_contact_draft') throw new DOMException('Full', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      });
      await page.locator('#contact-form button[type=submit]').click();
      assert.match(await page.locator('#contact-error').textContent(), /Could not save/);
      assert.match(await page.locator('#contact-message').inputValue(), /replacement question/);
      assert.equal(await page.evaluate(() => localStorage.getItem('vosc_contact_draft')), saved);
    } finally { await context.close(); }
  });
  await check('Unreadable contact drafts are preserved and do not block enquiry export', async () => {
    const { context, page } = await fixture();
    try {
      const raw = '{"incomplete":';
      await page.evaluate((raw) => localStorage.setItem('vosc_contact_draft', raw), raw);
      await page.goto(url('contact.html'));
      assert.match(await page.locator('#contact-error').textContent(), /Existing data has been kept/);
      await fillEnquiry(page); await page.locator('#contact-form button[type=submit]').click();
      assert.equal(await page.evaluate(() => localStorage.getItem('vosc_contact_draft')), raw);
      const promise = page.waitForEvent('download'); await page.locator('#download-enquiry').click();
      assert.match(await fs.readFile(await (await promise).path(), 'utf8'), /accessible entrance/);
    } finally { await context.close(); }
  });
  await check('Dashboard reports corrupt saved registrations without resetting them', async () => {
    const { context, page } = await fixture();
    try {
      await page.evaluate(() => localStorage.setItem('vosc_registrations', '{}'));
      await page.goto(url('dashboard.html'));
      assert.equal(await page.locator('#dashboard-records').isVisible(), false);
      assert.equal(await page.locator('#dashboard-empty').isVisible(), false);
      assert.match(await page.locator('#register-message').textContent(), /Existing records/);
      assert.equal(await page.evaluate(() => localStorage.getItem('vosc_registrations')), '{}');
    } finally { await context.close(); }
  });
  await check('Configured Google Form opens separately; invalid URLs keep the real local contact page', async () => {
    const { context, page } = await fixture();
    try {
      for (const contactFormUrl of ['https://forms.gle/Example123', 'javascript:alert(1)', 'https://docs.google.com/forms/d/example/edit']) {
        await page.route('**/js/event-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.VOSC_EVENT=' + JSON.stringify({ contactFormUrl }) }));
        await page.goto(event);
        const link = page.locator('#contact a');
        if (contactFormUrl.startsWith('https://forms.gle/')) {
          assert.equal(await link.getAttribute('href'), contactFormUrl);
          assert.equal(await link.getAttribute('target'), '_blank');
          assert.match(await link.getAttribute('rel'), /noopener/);
          await page.goto(url('contact.html'));
          assert.equal(await page.locator('#google-form-link').getAttribute('href'), contactFormUrl);
          assert.equal(await page.locator('#google-form-wrap').isVisible(), true);
        } else { assert.equal(await link.getAttribute('href'), 'contact.html'); }
        await page.unroute('**/js/event-config.js');
      }
    } finally { await context.close(); }
  });
  await check('All new pages support narrow layouts, keyboard skip links and mobile navigation', async () => {
    const { context, page } = await fixture();
    try {
      for (const width of [320, 375, 768, 960, 1280]) for (const name of ['registration.html', 'dashboard.html', 'contact.html']) {
        await page.setViewportSize({ width, height: 900 }); await page.goto(url(name));
        if (name === 'dashboard.html') {
          await page.evaluate(() => localStorage.setItem('vosc_registrations', JSON.stringify([{ name: 'Ada Student', email: 'ada@example.com', ref: 'VOSC-26-SAMPLE', role: 'student' }])));
          await page.reload();
          await page.locator('#confirmation').waitFor({ state: 'visible' });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, name + ' ' + width);
        await page.evaluate(() => document.activeElement.blur());
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('.skip-link').focus();
        assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
        if (width === 375) {
          await page.locator('.menu-toggle').click();
          assert.equal(await page.locator('.nav-links a[href="registration.html"]').isVisible(), true);
          await page.keyboard.press('Escape');
          assert.equal(await page.evaluate(() => document.activeElement.className), 'menu-toggle');
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(artifacts, name.replace('.html', '-mobile.png')), fullPage: true });
        }
        if (name === 'dashboard.html') await page.evaluate(() => localStorage.removeItem('vosc_registrations'));
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => localStorage.setItem('vosc_registrations', JSON.stringify([{ name: 'A'.repeat(80), email: 'a'.repeat(180) + '@example.com', ref: 'VOSC-26-LONG', role: 'student' }])));
      await page.goto(url('dashboard.html'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Populated dashboard with long participant details');
    } finally { await context.close(); }
  });
};
