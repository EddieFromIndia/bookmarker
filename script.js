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
        const { data, error } = await supabase
                                    .from('bookmark')
                                    .select('*')
                                    .order('rank', { ascending: true });
        if (error) return console.error(error);

        const container = document.getElementById('bookmark-container');
        container.innerHTML = '';

        for (const item of data) {
            const domain = new URL(item.url).hostname;
            const iconUrl = await getFaviconUrl(domain);

            const div = document.createElement('div');
            div.className = 'bookmark';

            div.innerHTML = `
                <div class="menu">⋮</div>
                <div class="menu-options hidden">
                    <button class="edit-btn">Edit</button>
                    <button class="remove-btn">Remove</button>
                </div>
                <a href="${item.url}" target="_blank">
                    <div class="icon">
                        <img src="${iconUrl}" alt="${item.name}"
                            onerror="this.style.display='none'; this.parentElement.textContent='${item.name[0].toUpperCase()}'">
                    </div>
                    ${item.name}
                </a>
            `;

            // Setup menu behavior
            const menu = div.querySelector('.menu');
            const menuOptions = div.querySelector('.menu-options');
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));
                menuOptions.classList.toggle('hidden');
            });

            // Edit
            div.querySelector('.edit-btn').addEventListener('click', () => {
                document.getElementById('popup').classList.remove('hidden');
                document.querySelector('.popup-content h3').textContent = 'Edit Bookmark';
                document.getElementById('nameInput').value = item.name;
                document.getElementById('urlInput').value = item.url;
                editingId = item.id;
                menuOptions.classList.add('hidden');
            });

            // Remove
            div.querySelector('.remove-btn').addEventListener('click', () => {
                document.getElementById('confirmPopup').classList.remove('hidden');
                deletingId = item.id;
                menuOptions.classList.add('hidden');
            });

            container.appendChild(div);
        }

        // Add button
        const addBtn = document.createElement('div');
        addBtn.className = 'add-button';
        addBtn.textContent = '+';
        addBtn.onclick = () => {
            document.getElementById('popup').classList.remove('hidden');
            document.querySelector('.popup-content h3').textContent = 'Add Bookmark';
            editingId = null;
        };
        container.appendChild(addBtn);
    }

    // Save bookmark (insert or update)
    document.getElementById('saveBtn').addEventListener('click', async () => {
        const name = document.getElementById('nameInput').value.trim();
        const url = document.getElementById('urlInput').value.trim();
        if (!name || !url) return;

        if (editingId) {
            const { error } = await supabase.from('bookmark').update({ name, url }).eq('id', editingId);
            if (error) return alert('Failed to update');
        } else {
            const { error } = await supabase.from('bookmark').insert([{ name, url }]);
            if (error) return alert('Failed to save');
        }

        closePopup();
        fetchData();
    });

    // Cancel Add/Edit
    document.getElementById('cancelBtn').addEventListener('click', closePopup);
    function closePopup() {
        document.getElementById('popup').classList.add('hidden');
        document.getElementById('nameInput').value = '';
        document.getElementById('urlInput').value = '';
        editingId = null;
    }

    // Confirm Remove
    document.getElementById('confirmRemove').addEventListener('click', async () => {
        if (!deletingId) return;
        const { error } = await supabase.from('bookmark').delete().eq('id', deletingId);
        if (error) return alert('Failed to delete');
        deletingId = null;
        document.getElementById('confirmPopup').classList.add('hidden');
        fetchData();
    });

    // Cancel Remove
    document.getElementById('confirmCancel').addEventListener('click', () => {
        deletingId = null;
        document.getElementById('confirmPopup').classList.add('hidden');
    });

    // Hide open menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.menu-options').forEach(m => m.classList.add('hidden'));
    });

    // Google Search form
    document.getElementById('searchForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        }
    });

    fetchData();
});