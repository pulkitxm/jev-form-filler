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
const experiences = {
  job: { brand: 'northstar', mark: '✳', category: 'CAREERS / ENGINEERING', title: 'Product Engineer', description: 'Help us build thoughtful tools for teams doing meaningful work. We’re looking for an engineer who cares as much about the details as the big picture.', tags: ['Engineering', 'Remote · India', 'Full-time'], heading: 'Apply for this role', intro: 'Tell us a little about yourself. Our team reviews every application.', action: 'Submit application', accent: '#315b48', sections: { 0: ['Personal information', 'How can we get in touch?'], 4: ['Professional background', 'Tell us where you work and share a few examples.'], 9: ['Your application', 'We’d love to hear your story.'] }, side: ['The role', 'Build product features from idea to launch, collaborate with design, and make complex workflows feel simple.', 'What you can expect', 'Flexible working hours|Home office allowance|Learning & development budget|A small, collaborative team'], note: 'Applications are reviewed on a rolling basis. We aim to respond within five working days.' },
  speaker: { brand: 'common ground', mark: 'cg.', category: 'CONFERENCE / CALL FOR SPEAKERS', title: 'Bring a fresh perspective.', description: 'Practical ideas. Honest stories. A room full of people who care about building better software. Share something worth talking about.', tags: ['Developer conference', 'Bengaluru', '25-minute sessions'], heading: 'Submit your talk proposal', intro: 'First-time speakers are welcome. Tell us what you want the audience to take away.', action: 'Submit proposal', accent: '#73462e', sections: { 0: ['About the speaker', 'Your contact details and professional background.'], 6: ['Your session', 'Help the programme committee understand your idea.'] }, side: ['A stage for useful ideas', 'We’re looking for real-world lessons, thoughtful technical deep dives, and stories from the work behind the work.', 'Speaker support', 'Presentation coaching|Travel support available|A complimentary conference pass|Session recording'], note: 'Proposals are reviewed for relevance, clarity, and originality. Sales pitches are not accepted.' },
  community: { brand: 'builders club', mark: 'b/', category: 'MEMBERSHIP / NEW APPLICATION', title: 'Good things start with people.', description: 'A community for curious makers, independent developers, and people who turn ideas into things. Come find your next collaborator.', tags: ['Member community', 'Online & in person', 'Free to join'], heading: 'Become a member', intro: 'Introduce yourself so we can connect you with the right people.', action: 'Request an invitation', accent: '#475ea1', sections: { 0: ['Your profile', 'A few basics to introduce you to the community.'], 3: ['What you’re building', 'Share your work and the skills you bring.'] }, side: ['A place to build together', 'Join thoughtful conversations, get feedback on early ideas, and meet people working on interesting problems.', 'Inside the club', 'Weekly project showcases|Small-group coworking|Local meetups|A friendly member directory'], note: 'We review new memberships weekly. You’ll receive your invitation by email.' },
  freelance: { brand: 'independent', mark: 'in.', category: 'TALENT NETWORK / JOIN US', title: 'Great work. On your terms.', description: 'Connect with teams looking for independent specialists. Create a profile that tells clients what you do best.', tags: ['Independent talent', 'Worldwide', 'Project-based work'], heading: 'Create your talent profile', intro: 'Your profile helps clients discover your experience and availability.', action: 'Submit profile for review', accent: '#654d88', sections: { 0: ['The essentials', 'Your name, expertise, and location.'], 4: ['Your work', 'Show clients what you can bring to their next project.'], 8: ['Rates & availability', 'Help us match you with suitable opportunities.'] }, side: ['Work that fits you', 'We connect experienced independent professionals with teams that value their craft. You choose which opportunities to pursue.', 'How it works', 'Create your profile|Get reviewed by our team|Receive relevant project briefs|Choose your next collaboration'], note: 'Your contact details are shared only when you choose to connect with a client.' },
  company: { brand: 'makers directory', mark: 'm.', category: 'COMPANY DIRECTORY / GET LISTED', title: 'Get your company discovered.', description: 'Join a directory of ambitious companies building useful products. Help future teammates, customers, and partners find you.', tags: ['Company listing', 'Editorially reviewed', 'Free basic profile'], heading: 'Create a company listing', intro: 'Please apply on behalf of a company you work for or represent.', action: 'Submit company listing', accent: '#30656e', sections: { 0: ['Your contact details', 'Who should we contact about this listing?'], 2: ['Company information', 'Tell us about the company and its work.'] }, side: ['Built for discovery', 'A considered directory of companies making a difference in their industries. Every listing is reviewed before publication.', 'Your listing includes', 'Company overview|Website and social links|Team size and location|A shareable company page'], note: 'Use your official company website. Our editors may contact you to verify the listing.' },
  checks: { brand: 'workspace', mark: 'w.', category: 'ACCOUNT / PROFILE & SECURITY', title: 'Your account settings', description: 'Manage your personal information, connected organisation, and account security.', tags: ['Personal account', 'Standard plan', 'Profile settings'], heading: 'Edit your profile', intro: 'Organisation-managed fields can only be changed by your administrator.', action: 'Save changes', accent: '#525967', sections: { 0: ['Personal details', 'Keep your contact information up to date.'], 4: ['Public profile', 'Choose what other members see.'], 6: ['Security & billing', 'Sensitive information should always be entered manually.'] }, side: ['Account overview', 'Your profile is visible to other members of your workspace. Billing information is only visible to you.', 'Settings', 'Profile information|Organisation membership|Password & security|Billing preferences'], note: 'This sample includes prefilled, read-only, disabled, and sensitive inputs for testing.' }
};
for (const form of forms) Object.assign(form, experiences[form.id]);
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
  brand.textContent = 'APPLICATION FORM';
  const heading = document.createElement('h2');
  heading.textContent = config.heading;
  const introduction = document.createElement('p');
  introduction.className = 'form-intro';
  introduction.textContent = config.intro;
  const requiredNote = document.createElement('p');
  requiredNote.className = 'required-note';
  requiredNote.textContent = 'Fields marked with * are required.';
  const fields = document.createElement('div');
  fields.className = 'fields';
  for (const [index, field] of config.fields.entries()) {
    if (config.sections[index]) {
      const section = document.createElement('div');
      section.className = 'section-heading';
      const title = document.createElement('h3');
      title.textContent = config.sections[index][0];
      const description = document.createElement('p');
      description.textContent = config.sections[index][1];
      section.append(title, description);
      fields.append(section);
    }
    if (config.id !== 'checks' && ['name', 'email'].includes(field.name)) field.required = true;
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
    if (field.type === 'file') { input.accept = '.pdf,.doc,.docx'; label.classList.add('upload'); }
    const placeholders = { name: 'e.g. Alex Morgan', email: 'you@example.com', phone: '+91 98765 43210', location: 'City, country', company: 'Company name', role: 'e.g. Software Engineer', website: 'https://your-portfolio.com', linkedin: 'https://linkedin.com/in/your-name', github: 'https://github.com/your-name', twitter: 'https://x.com/your-name', companyWebsite: 'https://company.com', bio: 'A short introduction to your background and experience', motivation: 'What interests you about the role and our team?', skills: 'e.g. Product design, TypeScript, technical writing', talk: 'Give your session a clear, specific title', abstract: 'What will attendees learn from your session?', rate: '75' };
    if (placeholders[field.name]) input.placeholder = placeholders[field.name];
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
  submit.textContent = config.action;
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
  form.append(brand, heading, introduction, requiredNote, fields, actions, result);
  container.append(form);
}
function navigate() {
  const selected = forms.find(form => `#${form.id}` === location.hash) || forms[0];
  document.querySelector('#title').textContent = selected.title;
  document.querySelector('#description').textContent = selected.description;
  document.querySelector('#section-name').textContent = selected.category;
  document.documentElement.style.setProperty('--accent', selected.accent);
  document.body.dataset.form = selected.id;
  document.querySelector('#company-brand').textContent = selected.brand;
  document.querySelector('#company-mark').textContent = selected.mark;
  document.querySelector('#tags').replaceChildren(...selected.tags.map(tag => { const item = document.createElement('span'); item.textContent = tag; return item; }));
  const guide = document.querySelector('.guide');
  guide.replaceChildren();
  const sideTitle = document.createElement('h2');
  sideTitle.textContent = selected.side[0];
  const sideDescription = document.createElement('p');
  sideDescription.textContent = selected.side[1];
  const listTitle = document.createElement('h3');
  listTitle.textContent = selected.side[2];
  const list = document.createElement('ul');
  for (const detail of selected.side[3].split('|')) { const li = document.createElement('li'); li.textContent = detail; list.append(li); }
  const note = document.createElement('p');
  note.className = 'side-note';
  note.textContent = selected.note;
  guide.append(sideTitle, sideDescription, listTitle, list, note);
  document.title = `${selected.nav} · Form Studio`;
  for (const form of container.children) form.hidden = form.id !== selected.id;
  for (const link of nav.children) {
    if (link.hash === `#${selected.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', navigate);
navigate();
