window.addEventListener('DOMContentLoaded', () => {
    let supabase;
    let lookupMap = {};
    let editingId = null;
    let deletingId = null;
    let selectedGroupId = null;
    let bookmarkSortables = [];

    async function init() {
        const res = await fetch('/config');
        const appConfig = await res.json();

        const supabaseUrl = appConfig.url;
        const supabaseKey = appConfig.key;

        supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
            db: { schema: 'eddie' }
        });

        fetchData();
    }

    function showOverlay(message = 'Loading...') {
        const overlay = document.getElementById('overlay');
        const messageBox = document.getElementById('overlayMessage');
        messageBox.textContent = message;
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        document.getElementById('overlay').classList.add('hidden');
    }

    function findLookupIcon(url) {
        try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            const path = u.pathname.replace(/\/+$/, ''); // remove trailing slash
            const segments = path.split('/').filter(Boolean).map(s => decodeURIComponent(s).toLowerCase());

            // Generate candidates in priority order
            const candidates = [];

            // 1. Full host + longest path segments
            for (let i = segments.length; i >= 1; i--) {
                candidates.push(`${host}/${segments.slice(0, i).join('/')}`);
            }
            // 2. Host only
            candidates.push(host);

            // 3. Parent domain matches + path segments
            const hostParts = host.split('.');
            if (hostParts.length > 2) {
                const parentDomain = hostParts.slice(-2).join('.');
                for (let i = segments.length; i >= 1; i--) {
                    candidates.push(`${parentDomain}/${segments.slice(0, i).join('/')}`);
                }
                candidates.push(parentDomain);
            }

            // Find first match in lookupMap
            for (const key of candidates) {
                if (lookupMap[key]) return lookupMap[key];
            }
        } catch (e) {
            console.warn("Invalid URL for lookup:", url);
        }
        return null;
    }

    function attachOptionEvents(option, icon, idx, preselectedIcon, container) {
        option.addEventListener('click', () => {
            document.querySelectorAll('#iconOptions div').forEach(d => d.classList.remove('selected'));
            option.classList.add('selected');
            container.dataset.selectedIcon = icon;
        });

        // Selection logic
        if ((preselectedIcon && preselectedIcon === icon) || (!preselectedIcon && idx === 0)) {
            option.classList.add('selected');
            container.dataset.selectedIcon = icon;
        }
    }

    async function urlToBase64(url) {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result); // result is data URI
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to convert URL to Base64:", e);
            return url; // fallback to original URL
        }
    }

    async function loadIconOptions(name, url, preselectedIcon = null) {
        if (!url) {
            document.getElementById('iconSelection').classList.add('hidden');
            return;
        }

        let lookupIcon = null;
        try {
            lookupIcon = findLookupIcon(url);
        } catch (e) {
            console.warn("Invalid URL for icon lookup:", url);
        }

        const domain = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
        const fallbackChar = name?.charAt(0)?.toUpperCase() || '?';
        const duckUrl = `https://icons.duckduckgo.com/ip1/${domain}.ico`;
        const clearbitUrl = `https://logo.clearbit.com/${domain}`;

        // Build icon list with lookup first if available
        let icons = [];
        if (lookupIcon) icons.push(lookupIcon);
        icons.push(duckUrl, clearbitUrl, `text:${fallbackChar}`);
        icons = [...new Set(icons)]; // remove duplicates

        const container = document.getElementById('iconOptions');
        container.innerHTML = '';
        container.dataset.selectedIcon = preselectedIcon || '';

        const validIcons = [];

        for (const icon of icons) {
            if (icon.startsWith('text:')) {
                validIcons.push({ type: 'text', src: icon });
            } else {
                const isValid = await new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => resolve(true);
                    img.onerror = () => resolve(false);
                    img.src = icon;
                });
                if (isValid) validIcons.push({ type: 'img', src: icon });
            }
        }

        validIcons.forEach((iconObj, idx) => {
            const option = document.createElement('div');

            if (iconObj.type === 'text') {
                option.textContent = iconObj.src.slice(5);
                option.style.fontWeight = 'bold';
            } else {
                const img = document.createElement('img');
                img.src = iconObj.src;
                option.appendChild(img);
            }

            option.addEventListener('click', () => {
                document.querySelectorAll('#iconOptions div').forEach(d => d.classList.remove('selected'));
                option.classList.add('selected');
                container.dataset.selectedIcon = iconObj.src;
            });

            if ((preselectedIcon && preselectedIcon === iconObj.src) || (!preselectedIcon && idx === 0)) {
                option.classList.add('selected');
                container.dataset.selectedIcon = iconObj.src;
            }

            container.appendChild(option);
        });

        document.getElementById('iconSelection').classList.remove('hidden');
    }

    async function fetchData() {
        showOverlay('Loading...');

        // Fetch lookup table once
        const { data: lookupRows, error: lookupError } = await supabase
            .from('icon_lookup')
            .select('website, icon');

        if (lookupError) {
            console.error("Failed to fetch icon_lookup:", lookupError);
        }

        lookupMap = {};
        if (lookupRows) {
            for (const row of lookupRows) {
                // normalize: remove trailing slash(es) and lowercase
                const key = String(row.website || '').replace(/\/+$/, '').toLowerCase();
                if (key) lookupMap[key] = row.icon;
            }
        }

        // Fetch groups and bookmarks
        const { data: groups, error: groupError } = await supabase
            .from('group')
            .select('*')
            .order('rank');
        const { data: bookmarks, error: bookmarkError } = await supabase
            .from('bookmark')
            .select('*')
            .order('rank');

        if (groupError || bookmarkError) {
            console.error(groupError || bookmarkError);
            return;
        }

        const container = document.getElementById('bookmark-container');
        container.innerHTML = '';

        for (const group of groups) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'group';

            const title = document.createElement('h3');
            title.className = 'group-title';
            title.innerHTML = `
                <span class="drag-handle">⋮⋮</span>
                <span class="group-name">${group.name}</span>
                <span class="group-menu-wrapper">
                    <span class="group-menu">⋮</span>
                    <div class="group-menu-options hidden">
                        <button class="rename-group">Rename</button>
                        <button class="delete-group">Remove</button>
                    </div>
                </span>
            `;

            const groupMenu = title.querySelector('.group-menu');
            const groupMenuOptions = title.querySelector('.group-menu-options');
            groupMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));
                document.querySelectorAll('.group-menu-options').forEach(g => g.classList.add('hidden'));
                groupMenuOptions.classList.toggle('hidden');
            });

            title.querySelector('.rename-group').addEventListener('click', () => {
                document.getElementById('groupPopup').classList.remove('hidden');
                document.getElementById('groupNameInput').value = group.name;
                document.getElementById('groupSaveBtn').dataset.id = group.id;
                groupMenuOptions.classList.add('hidden');
            });

            title.querySelector('.delete-group').addEventListener('click', () => {
                deletingId = group.id;
                document.getElementById('confirmPopup').classList.remove('hidden');
                document.getElementById('confirmPopup').dataset.type = 'group';
                document.querySelector('#confirmPopup .popup-content h3').textContent = 'Remove Group and its Bookmarks?';
                groupMenuOptions.classList.add('hidden');
            });

            const list = document.createElement('div');
            list.className = 'bookmark-list';
            list.dataset.groupId = group.id;

            const groupBookmarks = bookmarks.filter(b => b.group_id === group.id);
            for (const item of groupBookmarks) {
                const div = document.createElement('div');
                div.className = 'bookmark';
                div.dataset.id = item.id;

                let icon;
                const matchIcon = findLookupIcon(item.url);

                if (item.icon?.startsWith('text:')) {
                    icon = `<span style="font-weight:bold;">${item.icon.slice(5)}</span>`;
                } else if (item.icon) {
                    icon = `<img src="${item.icon}" alt="${item.name}" />`;
                } else if (matchIcon) {
                    icon = `<img src="${matchIcon}" alt="${item.name}" />`; // works with base64
                } else {
                    icon = `<span style="font-weight:bold;">${item.name.charAt(0).toUpperCase()}</span>`;
                }

                div.innerHTML = `
                    <div class="menu">⋮</div>
                    <div class="menu-options hidden">
                        <button class="edit-btn">Edit</button>
                        <button class="remove-btn">Remove</button>
                    </div>
                    <a href="${item.url}" target="_blank">
                        <div class="icon">
                            ${icon}
                        </div>
                        <div class="bookmark-text-wrapper">
                            <span class="bookmark-title">${item.name}</span>
                        </div>
                    </a>
                `;

                div.querySelector('.menu').addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));
                    document.querySelectorAll('.group-menu-options').forEach(g => g.classList.add('hidden'));
                    div.querySelector('.menu-options').classList.toggle('hidden');
                });

                div.querySelector('.edit-btn').addEventListener('click', () => {
                    document.getElementById('popup').classList.remove('hidden');
                    document.querySelector('.popup-content h3').textContent = 'Edit Bookmark';
                    document.getElementById('nameInput').value = item.name;
                    document.getElementById('urlInput').value = item.url;
                    document.getElementById('iconOptions').dataset.selectedIcon = item.icon || '';
                    editingId = item.id;
                    selectedGroupId = item.group_id;
                    loadIconOptions(item.name, item.url, item.icon);
                });

                div.querySelector('.remove-btn').addEventListener('click', () => {
                    document.getElementById('confirmPopup').classList.remove('hidden');
                    document.getElementById('confirmPopup').dataset.type = 'bookmark';
                    document.querySelector('#confirmPopup .popup-content h3').textContent = 'Remove Bookmark?';
                    deletingId = item.id;
                });

                list.appendChild(div);
            }

            const addBtn = document.createElement('div');
            addBtn.className = 'add-button';
            addBtn.textContent = '+';
            addBtn.onclick = () => {
                document.getElementById('popup').classList.remove('hidden');
                document.querySelector('.popup-content h3').textContent = 'Add Bookmark';
                document.getElementById('nameInput').value = '';
                document.getElementById('urlInput').value = '';
                document.getElementById('iconOptions').dataset.selectedIcon = '';
                editingId = null;
                selectedGroupId = group.id;
                loadIconOptions('', '', null);
                setTimeout(() => document.getElementById('nameInput').focus(), 0);
            };
            list.appendChild(addBtn);

            groupDiv.appendChild(title);
            groupDiv.appendChild(list);

            const groupWrapper = document.createElement('div');
            groupWrapper.className = 'group-wrapper';
            groupWrapper.appendChild(groupDiv);
            container.appendChild(groupWrapper);

            const bookmarkSortable = Sortable.create(list, {
                group: { name: 'shared-bookmarks', pull: true, put: true },
                animation: 150,
                draggable: '.bookmark',
                filter: '.add-button',
                preventOnFilter: false,
                onStart: () => document.querySelectorAll('.add-button').forEach(btn => btn.remove()),
                onEnd: async (evt) => {
                    const list = evt.to;
                    const groupId = list.dataset.groupId;
                    showOverlay('Updating...');
                    const items = [...list.querySelectorAll('.bookmark:not(.add-button)')];
                    for (let i = 0; i < items.length; i++) {
                        const id = items[i].dataset.id;
                        if (!id || !groupId) continue;
                        await supabase.from('bookmark').update({ rank: i + 1, group_id: groupId }).eq('id', id);
                    }
                    document.querySelectorAll('.bookmark-list').forEach(groupList => {
                        const addBtn = document.createElement('div');
                        addBtn.className = 'add-button';
                        addBtn.textContent = '+';
                        addBtn.onclick = () => {
                            document.getElementById('popup').classList.remove('hidden');
                            document.querySelector('.popup-content h3').textContent = 'Add Bookmark';
                            editingId = null;
                            selectedGroupId = groupList.dataset.groupId;
                        };
                        groupList.appendChild(addBtn);
                    });
                    hideOverlay();
                }
            });
            bookmarkSortables.push(bookmarkSortable);

            Sortable.create(container, {
                animation: 150,
                handle: '.drag-handle',
                draggable: '.group-wrapper',
                onStart: () => bookmarkSortables.forEach(instance => instance.option('disabled', true)),
                onEnd: async () => {
                    showOverlay('Updating...');
                    const wrappers = [...container.querySelectorAll('.group-wrapper')];
                    for (let i = 0; i < wrappers.length; i++) {
                        const groupId = wrappers[i].querySelector('.bookmark-list')?.dataset.groupId;
                        if (!groupId) continue;
                        await supabase.from('group').update({ rank: i + 1 }).eq('id', groupId);
                    }
                    bookmarkSortables.forEach(instance => instance.option('disabled', false));
                    hideOverlay();
                }
            });
        }

        hideOverlay();
    }

    document.getElementById('saveBtn').addEventListener('click', async () => {
        const name = document.getElementById('nameInput').value.trim();
        const url = document.getElementById('urlInput').value.trim();
        if (!name || !url) return;

        if (!selectedGroupId) {
        alert('Please select a group to save the bookmark in.');
        return;
        }

        showOverlay('Saving...');

        let icon = document.getElementById('iconOptions').dataset.selectedIcon || null;

        // If the icon is a URL, convert to Base64
        if (icon && !icon.startsWith('data:') && !icon.startsWith('text:')) {
            icon = await urlToBase64(icon);
        }

        if (editingId) {
            const { error } = await supabase.from('bookmark')
                .update({ name, url, icon })
                .eq('id', editingId);
            if (error) return alert('Failed to update');
        } else {
            const { data: groups, error: fetchError } = await supabase
                .from('bookmark')
                .select('rank')
                .order('rank', { ascending: false })
                .limit(1);

            if (fetchError) {
                console.error(fetchError);
                return alert('Failed to fetch current rank');
            }

            const maxRank = groups?.[0]?.rank ?? 0;
            const newRank = maxRank + 1;

            const { error } = await supabase.from('bookmark')
                .insert([{ name, url, group_id: selectedGroupId, rank: newRank, icon }]);
            if (error) return alert('Failed to save');
        }

        closePopup();
        hideOverlay();
        await fetchData();
    });

    ['blur', 'input'].forEach(evt => {
        document.getElementById('nameInput').addEventListener(evt, () => {
            const name = document.getElementById('nameInput').value.trim();
            const url = document.getElementById('urlInput').value.trim();
            loadIconOptions(name, url, document.getElementById('iconOptions').dataset.selectedIcon);
        });
        document.getElementById('urlInput').addEventListener(evt, () => {
            const name = document.getElementById('nameInput').value.trim();
            const url = document.getElementById('urlInput').value.trim();
            loadIconOptions(name, url, document.getElementById('iconOptions').dataset.selectedIcon);
        });
    });

    document.getElementById('cancelBtn').addEventListener('click', closePopup);
    function closePopup() {
        document.getElementById('popup').classList.add('hidden');
        document.getElementById('nameInput').value = '';
        document.getElementById('urlInput').value = '';
        editingId = null;
        selectedGroupId = null;
    }

    document.getElementById('confirmRemove').addEventListener('click', async () => {
        const type = document.getElementById('confirmPopup').dataset.type;

        if (type === 'group') {
            if (!deletingId) return;

            // Delete all bookmarks in group
            await supabase.from('bookmark').delete().eq('group_id', deletingId);

            // Delete group
            const { error } = await supabase.from('group').delete().eq('id', deletingId);
            if (error) return alert('Failed to delete group');

        } else {
            // Bookmark delete
            if (!deletingId) return;
            const { error } = await supabase.from('bookmark').delete().eq('id', deletingId);
            if (error) return alert('Failed to delete bookmark');
        }

        deletingId = null;
        document.getElementById('confirmPopup').classList.add('hidden');
        await fetchData();
    });

    document.getElementById('confirmCancel').addEventListener('click', () => {
        deletingId = null;
        document.getElementById('confirmPopup').classList.add('hidden');
        document.getElementById('confirmPopup').dataset.type = '';
    });

    document.addEventListener('click', (e) => {
        // Hide bookmark menus
        document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));

        // Hide group menus
        document.querySelectorAll('.group-menu-options').forEach(menu => {
            // Only hide if the click is outside the menu and the ⋮ trigger
            if (!menu.contains(e.target) && !menu.previousElementSibling.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    });

    document.getElementById('searchForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        }
    });

    document.getElementById('addGroupBtn').addEventListener('click', () => {
        document.getElementById('groupPopup').classList.remove('hidden');
        document.querySelector('#groupPopup .popup-content h3').textContent = 'Add Group';
        document.getElementById('groupNameInput').value = '';

        setTimeout(() => {
            document.getElementById('groupNameInput').focus();
        }, 0);
    });

    document.getElementById('groupCancelBtn').addEventListener('click', () => {
        document.getElementById('groupPopup').classList.add('hidden');
        document.getElementById('groupSaveBtn').dataset.id = '';
    });

    document.getElementById('groupSaveBtn').addEventListener('click', async () => {
        const name = document.getElementById('groupNameInput').value.trim();
        const groupId = document.getElementById('groupSaveBtn').dataset.id;

        if (!name) return;

        showOverlay('Saving...');

        if (groupId) {
            const { error } = await supabase.from('group').update({ name }).eq('id', groupId);
            if (error) return alert('Failed to rename group');
        } else {
            const { data: groups, error: fetchError } = await supabase
                .from('group')
                .select('rank')
                .order('rank', { ascending: false })
                .limit(1);

            if (fetchError) {
                console.error(fetchError);
                return alert('Failed to fetch current rank');
            }

            const maxRank = groups?.[0]?.rank ?? 0;
            const newRank = maxRank + 1;
            
            const { error } = await supabase.from('group').insert({ name, rank: newRank });
            if (error) return alert('Failed to add group');
        }

        document.getElementById('groupPopup').classList.add('hidden');
        document.getElementById('groupSaveBtn').dataset.id = '';
        hideOverlay();
        await fetchData();
    });

    document.addEventListener('keydown', (e) => {
        const popupOpen = !document.getElementById('popup').classList.contains('hidden');
        const groupPopupOpen = !document.getElementById('groupPopup').classList.contains('hidden');
        const confirmOpen = !document.getElementById('confirmPopup').classList.contains('hidden');

        if (popupOpen || groupPopupOpen || confirmOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (popupOpen) closePopup();
                if (groupPopupOpen) {
                    document.getElementById('groupPopup').classList.add('hidden');
                    document.getElementById('groupSaveBtn').dataset.id = '';
                }
                if (confirmOpen) {
                    document.getElementById('confirmPopup').classList.add('hidden');
                    document.getElementById('confirmPopup').dataset.type = '';
                    deletingId = null;
                }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (popupOpen) document.getElementById('saveBtn').click();
                if (groupPopupOpen) document.getElementById('groupSaveBtn').click();
                if (confirmOpen) document.getElementById('confirmRemove').click();
            }
        }
    });

    init();
});