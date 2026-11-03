/** Small native V14 forms for declared utility choices and private GM findings.
 * Text enters through DOM properties, never interpolated HTML. */
export async function utilityDialog({title, note = "", fields = [], timeout = 120000}) {
  const content = document.createElement("div");
  if (note) {
    const p = document.createElement("p");
    p.textContent = note;
    content.append(p);
  }
  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "form-group";
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement(field.options ? "select" : field.multiline ? "textarea" : "input");
    input.name = field.name;
    input.required = field.required !== false;
    if (field.options) for (const option of field.options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      input.append(node);
    } else if (!field.multiline) input.type = field.type ?? "text";
    if (field.type === "checkbox") input.checked = field.value === true;
    else input.value = field.value ?? "";
    if (field.type === "number") { input.min = field.min ?? 0; input.max = field.max ?? 86400; }
    if (!field.options && field.type !== "checkbox") input.maxLength = field.maxLength ?? 1000;
    label.append(input);
    row.append(label);
    content.append(row);
  }
  let dialog, timer;
  const answer = foundry.applications.api.DialogV2.wait({
    classes: ["azeroth", "azeroth-roll-dialog"], window: {title}, content,
    rejectClose: false,
    render: (_event, instance) => { dialog = instance; },
    buttons: [{action: "accept", label: "AZEROTH.Utility.Accept", default: true,
      callback: (_event, button) => {
        const form = button.form;
        if (!form?.reportValidity()) return null;
        return Object.fromEntries(fields.map(field => {
          const input = form.elements.namedItem(field.name);
          return [field.name, field.type === "checkbox" ? input.checked
            : field.type === "number" ? Number(input.value) : input.value.trim()];
        }));
      }}, {action: "cancel", label: "AZEROTH.Utility.Cancel", callback: () => null}]
  });
  try {
    return await Promise.race([answer, new Promise(resolve => {
      timer = setTimeout(() => resolve(null), timeout);
    })]);
  } finally {
    clearTimeout(timer);
    await dialog?.close?.();
  }
}
