const text = (label, name, type = 'text', extra = {}) => ({ label, name, type, ...extra });
const select = (label, name, options) => ({ label, name, type: 'select', options });
const forms = [
  { id: 'job', nav: 'Job application', icon: '01', title: 'Your next chapter.', description: 'A classic job application with contact details, professional links, and longer answers.', company: 'NORTHSTAR STUDIO', heading: 'Product engineer application', fields: [text('Full name', 'name', 'text', { autocomplete: 'name', required: true }), text('Email address', 'email', 'email', { required: true }), text('Phone number', 'phone', 'tel'), text('Location', 'location'), text('Current company', 'company'), text('Job title', 'role'), text('Portfolio URL', 'website', 'url'), text('LinkedIn URL', 'linkedin', 'url'), text('GitHub URL', 'github', 'url'), text('About you', 'bio', 'textarea'), text('Why do you want this role?', 'motivation', 'textarea'), text('Resume', 'resume', 'file')] },
  { id: 'speaker', nav: 'Speaker proposal', icon: '02', title: 'Share what you know.', description: 'Test public profile details, social links, a biography, and questions that need an original answer.', company: 'COMMON GROUND CONF', heading: 'Propose a session', fields: [text('Full name', 'name'), text('Email address', 'email', 'email'), text('Job title', 'role'), text('Current company', 'company'), text('Company website URL', 'companyWebsite', 'url'), text('X / Twitter URL', 'twitter', 'url'), text('About you', 'bio', 'textarea'), text('Talk title', 'talk'), text('Talk abstract', 'abstract', 'textarea'), select('Session format', 'format', ['Lightning talk', 'Workshop', 'Keynote'])] },
  { id: 'community', nav: 'Community signup', icon: '03', title: 'Find your people.', description: 'A compact member profile with a mix of everyday details and controls that need manual input.', company: 'BUILDERS CLUB', heading: 'Join the community', fields: [text('Full name', 'name'), text('Email address', 'email', 'email'), text('Location', 'location'), text('GitHub URL', 'github', 'url'), text('X / Twitter URL', 'twitter', 'url'), text('Skills', 'skills', 'textarea'), select('Country', 'country', ['India', 'United Kingdom', 'United States', 'Germany', 'Other']), text('Send me community updates', 'updates', 'checkbox')] },
  { id: 'freelance', nav: 'Freelancer profile', icon: '04', title: 'Put your work out there.', description: 'A professional directory listing with portfolio links, skills, and commercial details.', company: 'INDEPENDENT INDEX', heading: 'Create your listing', fields: [text('Full name', 'name'), text('Email address', 'email', 'email'), text('Job title', 'role'), text('Location', 'location'), text('Portfolio URL', 'website', 'url'), text('LinkedIn URL', 'linkedin', 'url'), text('About you', 'bio', 'textarea'), text('Skills', 'skills', 'textarea'), text('Hourly rate in USD', 'rate', 'number'), text('Available from', 'available', 'date')] },
  { id: 'company', nav: 'Company directory', icon: '05', title: 'Introduce your team.', description: 'Check that company names and company URLs stay separate from your personal social profiles.', company: 'MAKERS DIRECTORY', heading: 'Add a company', fields: [text('Full name', 'name'), text('Email address', 'email', 'email'), text('Current company', 'company'), text('Company website URL', 'companyWebsite', 'url'), text('Job title', 'role'), text('LinkedIn URL', 'linkedin', 'url'), text('Company description', 'description', 'textarea'), select('Team size', 'size', ['1–10', '11–50', '51–200', '201+'])] },
  { id: 'checks', nav: 'Safety & edge cases', icon: '06', title: 'Make sure it holds up.', description: 'Existing values, validation, hidden inputs, and sensitive fields. Some fields are intentionally supposed to stay untouched.', company: 'QUALITY CHECK', heading: 'The careful-fill test', fields: [text('Full name', 'name', 'text', { value: 'Keep this existing name' }), text('Email address', 'email', 'email'), text('Current company', 'company', 'text', { value: 'Read-only example', readOnly: true }), text('Job title', 'role', 'text', { disabled: true }), text('Portfolio URL', 'website', 'url'), text('About you', 'bio', 'textarea', { maxLength: 40 }), text('Password', 'password', 'password'), text('Credit card number', 'card'), text('I agree to the terms', 'consent', 'checkbox'), text('Hidden test field', 'hidden', 'hidden', { value: 'Must remain unchanged' })] }
];
const nav = document.querySelector('nav');
const container = document.querySelector('#forms');
for (const config of forms) {
  const link = document.createElement('a');
  link.href = `#${config.id}`;
  const number = document.createElement('span');
  number.textContent = config.icon;
  link.append(number, document.createTextNode(config.nav));
  nav.append(link);
  const form = document.createElement('form');
  form.id = config.id;
  form.hidden = true;
  const brand = document.createElement('p');
  brand.className = 'eyebrow';
  brand.textContent = config.company;
  const heading = document.createElement('h2');
  heading.textContent = config.heading;
  const fields = document.createElement('div');
  fields.className = 'fields';
  for (const field of config.fields) {
    const label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '');
    if (['textarea', 'file', 'checkbox'].includes(field.type)) label.className = 'wide';
    const input = document.createElement(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input');
    if (input.tagName === 'INPUT') input.type = field.type;
    for (const prop of ['name', 'autocomplete', 'required', 'value', 'readOnly', 'disabled', 'maxLength']) if (field[prop] !== undefined) input[prop] = field[prop];
    if (field.options) {
      input.add(new Option('Choose an option', ''));
      field.options.forEach(option => input.add(new Option(option, option.toLowerCase().replaceAll(' ', '-'))));
    }
    if (input.tagName === 'INPUT') input.defaultValue = input.value;
    if (field.type === 'textarea') input.rows = 4;
    if (field.maxLength) {
      const hint = document.createElement('small');
      hint.textContent = `Maximum ${field.maxLength} characters`;
      label.append(hint);
    }
    if (field.type === 'checkbox') label.classList.add('checkbox');
    label.append(input);
    if (field.type === 'hidden') label.hidden = true;
    fields.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'actions';
  const submit = document.createElement('button');
  submit.textContent = 'Test submission';
  const reset = document.createElement('button');
  reset.type = 'reset';
  reset.className = 'secondary';
  reset.textContent = 'Reset form';
  actions.append(submit, reset);
  const result = document.createElement('p');
  result.className = 'result';
  result.setAttribute('role', 'status');
  form.onsubmit = event => { event.preventDefault(); result.textContent = 'Test complete. Validation passed. Nothing was sent or saved.'; };
  form.onreset = () => { result.textContent = 'Form reset. Ready for another fill.'; };
  form.append(brand, heading, fields, actions, result);
  container.append(form);
}
function navigate() {
  const selected = forms.find(form => `#${form.id}` === location.hash) || forms[0];
  document.querySelector('#title').textContent = selected.title;
  document.querySelector('#description').textContent = selected.description;
  document.querySelector('#section-name').textContent = selected.nav.toUpperCase();
  document.title = `${selected.nav} · Form Studio`;
  for (const form of container.children) form.hidden = form.id !== selected.id;
  for (const link of nav.children) {
    if (link.hash === `#${selected.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', navigate);
navigate();
