export function expandEvidence(items) {
  const result = [];
  const seen = new Set();
  const add = item => {
    const value = String(item.value || '').replace(/\s+/g, ' ').trim();
    const key = `${item.kind}:${value.toLowerCase()}`;
    if (!value || value.length > 2400 || seen.has(key)) return;
    seen.add(key);
    result.push({ ...item, value });
  };
  for (const item of items) {
    add(item);
    const context = item.context || item.value;
    if (/skills?|technologies|tech stack|programming languages?|languages?|knowsabout/i.test(item.kind)) {
      const values = item.value.split(/\s*(?:,|;|\||•|\n)\s*/).map(value => value.trim()).filter(Boolean);
      if (values.length > 1) for (const [listPosition, value] of values.entries()) add({ ...item, kind: 'Programming language or skill', value, context: `${item.kind}: ${item.value}. ${context}`, derivedFromList: true, listPosition });
    }
    if (['location', 'address', 'Location'].includes(item.kind)) {
      const parts = item.value.split(/[,|•]/).map(value => value.trim()).filter(Boolean);
      for (const value of parts) add({ ...item, kind: 'Location component', value, context: `Location: ${item.value}. ${context}` });
    }
    if (!['passage', 'bio'].includes(item.kind)) continue;
    for (const match of item.value.matchAll(/(?:^|[.;\n])\s*([\p{L}][\p{L}\s/()-]{1,60}):\s*([^;\n]{1,220})/gu)) add({ ...item, kind: match[1].trim(), value: match[2].replace(/\.$/, ''), context });
    for (const match of item.value.matchAll(/\b(?:based in|live in|living in|located in|location:)\s+([\p{L}][\p{L} ,'-]{1,100}?)(?=,?\s+(?:working|building|and|where)|[.!;]|$)/giu)) {
      const location = match[1].trim().replace(/,$/, '');
      add({ ...item, kind: 'location', value: location, context });
      for (const value of location.split(',').map(value => value.trim()).filter(Boolean)) add({ ...item, kind: 'Location component', value, context: `Location: ${location}. ${context}` });
    }
    for (const sentence of item.value.split(/(?<=[.!?])\s+/)) {
      if (sentence.length > 15) add({ ...item, kind: 'passage', value: sentence, context });
    }
  }
  return result;
}
export function rankEvidence(field, items) {
  const label = `${field.label || ''} ${field.autocomplete || ''} ${field.name || ''}`.toLowerCase();
  const tokens = label.match(/[\p{L}\p{N}]{3,}/gu) || [];
  const location = /city|state|province|region|country|postal|zip|address|location/.test(label);
  const programmingLanguage = /programming language|coding language|go-to language|preferred language|favorite language|favourite language/.test(label);
  return items.map((item, index) => {
    const kind = (item.kind || '').toLowerCase();
    const context = `${kind} ${item.context || ''} ${item.value}`.toLowerCase();
    const score = (item.saved ? 8 : 0) + tokens.reduce((sum, token) => sum + (kind.includes(token) ? 12 : context.includes(token) ? 3 : 0), 0) + (location && /location|city|state|country|address|region|postal/.test(kind) ? 12 : 0) + (programmingLanguage && /programming language|skills?|technolog|tech stack|knowsabout/.test(kind) ? 24 : 0);
    return { item, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.item);
}
