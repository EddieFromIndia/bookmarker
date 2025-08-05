window.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = window.appConfig.url;
    const supabaseKey = window.appConfig.key;

    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
        db: {
        schema: 'eddie'
        }
    });

    let editingId = null;
    let deletingId = null;
    let selectedGroupId = null;

    async function getFaviconUrl(domain) {
        const duckUrl = `https://icons.duckduckgo.com/ip1/${domain}.ico`;
        const clearbitUrl = `https://logo.clearbit.com/${domain}`;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve(img.naturalHeight < 32 ? clearbitUrl : duckUrl);
            };
            img.onerror = () => resolve(clearbitUrl);
            img.src = duckUrl;
        });
    }

    async function fetchData() {
        const { data: groups, error: groupError } = await supabase
            .from('group')
            .select('*')
            .order('created_at');

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
                <span class="group-name">${group.name}</span>
                <span class="group-menu">⋮</span>
                <div class="group-menu-options hidden">
                    <button class="rename-group">Rename</button>
                    <button class="delete-group">Delete</button>
                </div>
            `;

            const groupMenu = title.querySelector('.group-menu');
            const groupMenuOptions = title.querySelector('.group-menu-options');

            groupMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close all bookmark and group menus
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

                // Set custom title
                document.querySelector('#confirmPopup .popup-content h3').textContent = 'Delete Group and its Bookmarks?';
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

                const domain = new URL(item.url).hostname;
                const iconUrl = await getFaviconUrl(domain);

                div.innerHTML = `
                    <div class="menu">⋮</div>
                    <div class="menu-options hidden">
                        <button class="edit-btn">Edit</button>
                        <button class="remove-btn">Remove</button>
                    </div>
                    <a href="${item.url}" target="_blank">
                        <div class="icon">
                        <img src="${iconUrl}" alt="${item.name}" />
                        </div>
                        ${item.name}
                    </a>
                `;

                div.querySelector('.menu').addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close all bookmark and group menus
                    document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));
                    document.querySelectorAll('.group-menu-options').forEach(g => g.classList.add('hidden'));
                    div.querySelector('.menu-options').classList.toggle('hidden');
                });

                div.querySelector('.edit-btn').addEventListener('click', () => {
                    document.getElementById('popup').classList.remove('hidden');
                    document.querySelector('.popup-content h3').textContent = 'Edit Bookmark';
                    document.getElementById('nameInput').value = item.name;
                    document.getElementById('urlInput').value = item.url;
                    editingId = item.id;
                    selectedGroupId = item.group_id;
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
                editingId = null;
                selectedGroupId = group.id;
            };

            list.appendChild(addBtn);

            groupDiv.appendChild(title);
            groupDiv.appendChild(list);
            container.appendChild(groupDiv);

            Sortable.create(list, {
                group: 'shared-bookmarks',
                animation: 150,
                draggable: '.bookmark',
                onEnd: async (evt) => {
                    const items = [...evt.to.querySelectorAll('.bookmark')];
                    for (let i = 0; i < items.length; i++) {
                        const id = items[i].dataset.id;
                        const groupId = evt.to.dataset.groupId;
                        if (!id || !groupId) continue;
                        await supabase.from('bookmark').update({
                            rank: i,
                            group_id: groupId
                            }).eq('id', id);
                    }
                    await fetchData();
                }
            });
        }
    }

    document.getElementById('saveBtn').addEventListener('click', async () => {
        const name = document.getElementById('nameInput').value.trim();
        const url = document.getElementById('urlInput').value.trim();
        if (!name || !url) return;

        if (!selectedGroupId) {
        alert('Please select a group to save the bookmark in.');
        return;
        }

        if (editingId) {
        const { error } = await supabase.from('bookmark').update({ name, url }).eq('id', editingId);
        if (error) return alert('Failed to update');
        } else {
        const { error } = await supabase.from('bookmark').insert([{ name, url, group_id: selectedGroupId }]);
        if (error) return alert('Failed to save');
        }

        closePopup();
        await fetchData();
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
        document.getElementById('groupNameInput').value = '';
    });

    document.getElementById('groupCancelBtn').addEventListener('click', () => {
        document.getElementById('groupPopup').classList.add('hidden');
        document.getElementById('groupSaveBtn').dataset.id = '';
    });

    document.getElementById('groupSaveBtn').addEventListener('click', async () => {
        const name = document.getElementById('groupNameInput').value.trim();
        const groupId = document.getElementById('groupSaveBtn').dataset.id;

        if (!name) return;

        if (groupId) {
            const { error } = await supabase.from('group').update({ name }).eq('id', groupId);
            if (error) return alert('Failed to rename group');
        } else {
            const { error } = await supabase.from('group').insert({ name });
            if (error) return alert('Failed to add group');
        }

        document.getElementById('groupPopup').classList.add('hidden');
        document.getElementById('groupSaveBtn').dataset.id = '';
        await fetchData();
    });

    fetchData();
});