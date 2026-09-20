/**
 * Compact action bar: one primary button + expandable "Actions >>" menu.
 * The menu panel opens upward (may cover rack/board); the toggle stays put.
 */

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {{ label: string, className?: string, disabled?: boolean, onClick: Function }} opts.primary
 * @param {Array<{ label: string, className?: string, disabled?: boolean, onClick: Function }>} opts.actions
 * @param {boolean} opts.expanded
 * @param {() => void} opts.onToggle
 * @param {boolean} [opts.disabled] — hide/disable whole bar (e.g. game over)
 */
export function renderActionBar(container, opts) {
  var primary = opts.primary;
  var actions = (opts.actions || []).filter(function (a) {
    return !a.disabled;
  });
  var expanded = !!opts.expanded;
  var onToggle = opts.onToggle;
  var barDisabled = !!opts.disabled;

  container.innerHTML = '';
  container.className = 'action-bar';

  if (barDisabled || !primary) return;

  var primaryBtn = document.createElement('button');
  primaryBtn.type = 'button';
  primaryBtn.className = primary.className || 'primary';
  primaryBtn.textContent = primary.label;
  primaryBtn.disabled = !!primary.disabled;
  primaryBtn.addEventListener('click', function (e) {
    if (typeof primary.onClick === 'function') primary.onClick(e);
  });
  container.appendChild(primaryBtn);

  if (!actions.length) return;

  var menu = document.createElement('div');
  menu.className = 'action-menu' + (expanded ? ' action-menu--open' : '');

  var panel = document.createElement('div');
  panel.className = 'action-menu__panel';
  panel.hidden = !expanded;
  actions.forEach(function (a) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    if (a.className) b.className = a.className;
    b.addEventListener('click', function (e) {
      if (typeof a.onClick === 'function') a.onClick(e);
    });
    panel.appendChild(b);
  });
  menu.appendChild(panel);

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'action-menu__toggle';
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggle.textContent = expanded ? 'Actions <<' : 'Actions >>';
  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof onToggle === 'function') onToggle();
  });
  menu.appendChild(toggle);

  container.appendChild(menu);
}
