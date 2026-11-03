/* =========================================================
   طلای مهرگان — لایهٔ جاوااسکریپت
   داده‌ها از دیتابیس MySQL می‌آیند و از طریق API سروری
   (cart.php / admin.php / checkout.php) به‌روز می‌شوند.
   localStorage فقط به‌عنوان حافظهٔ کمکی برای همگام‌سازی است.
   ========================================================= */
(function () {
    'use strict';

    /* ---------- ابزارهای عمومی ---------- */
    const $  = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
            catch (e) { return fallback; }
        },
        set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    };

    const faDigits = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    const SHIPPING = 0; // ارسال رایگان بیمه‌شده
    const toman = n => faDigits(Number(n).toLocaleString('en-US').replace(/,/g, '٬'));

    function toast(message) {
        const box = $('#toast'), text = $('#toastText');
        if (!box) return;
        text.textContent = message;
        box.classList.remove('hidden');
        clearTimeout(box._t);
        box._t = setTimeout(() => box.classList.add('hidden'), 2600);
    }

    /* ---------- محصولات (دیتابیس MySQL) ---------- */
    function allProducts() {
        const src = window.__ADMIN_PRODUCTS__ || window.__PRODUCTS__ || [];
        return src.map(p => Object.assign({}, p));
    }

    /** فراخوانی API سروری با توکن CSRF (در نسخهٔ استاتیک: شبیه‌سازی محلی) */
    async function api(url, data) {
        if (window.__STATIC_API__) {
            try { return await window.__STATIC_API__(url, data); }
            catch (e) { return { ok: false, error: 'این عملیات در حالت نمایشی ممکن نیست' }; }
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__CSRF__ || '' },
            body: JSON.stringify(data || {})
        });
        try { return await res.json(); }
        catch (e) { return { ok: false, error: 'پاسخ نامعتبر از سرور' }; }
    }

    function findProduct(sku) { return allProducts().find(p => p.sku === sku) || null; }

    /* ---------- سبد خرید (نشست سرور + همگام‌سازی) ---------- */
    const CART_KEY = 'mehrghan_cart_v1';

    const Cart = {
        items() {
            return Array.isArray(window.__CART__) ? window.__CART__ : store.get(CART_KEY, []);
        },
        save(items) {
            window.__CART__ = items;
            store.set(CART_KEY, items);
            Cart.render();
            document.dispatchEvent(new CustomEvent('cart:change'));
            Cart.sync(items);
        },
        /** ارسال وضعیت سبد به سرور تا در نشست ذخیره شود */
        sync(items) {
            if (window.__STATIC__) return;
            try {
                fetch('cart.php?action=sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__CSRF__ || '' },
                    body: JSON.stringify({ items }),
                    keepalive: true
                }).catch(() => {});
            } catch (e) {}
        },
        count() { return Cart.items().reduce((s, i) => s + i.qty, 0); },
        add(sku, qty = 1) {
            const p = findProduct(sku);
            if (!p) return;
            if (p.stock <= 0) { toast('این کالا فعلاً ناموجود است'); return; }
            const items = Cart.items().map(i => Object.assign({}, i));
            const row = items.find(i => i.sku === sku);
            if (row) row.qty = Math.min(row.qty + qty, p.stock);
            else items.push({ sku, qty: Math.min(qty, p.stock) });
            Cart.save(items);
            toast('«' + p.name + '» به سبد خرید اضافه شد');
        },
        update(sku, qty) {
            const items = Cart.items().map(i => Object.assign({}, i));
            const row = items.find(i => i.sku === sku);
            if (!row) return;
            const p = findProduct(sku);
            row.qty = Math.max(1, Math.min(qty, p ? p.stock : 99));
            Cart.save(items);
        },
        remove(sku) { Cart.save(Cart.items().filter(i => i.sku !== sku)); },
        clear() { Cart.save([]); },
        lines() {
            return Cart.items().map(i => Object.assign({}, i, { product: findProduct(i.sku) }))
                .filter(l => l.product);
        },
        subtotal() { return Cart.lines().reduce((s, l) => s + l.product.price * l.qty, 0); },
        render() {
            const n = Cart.count();
            $$('[data-cart-count]').forEach(el => {
                el.textContent = faDigits(n);
                el.classList.toggle('hidden', n === 0);
            });
        }
    };
    window.Cart = Cart;

    /* ---------- هدر و منو ---------- */
    function initChrome() {
        const header = $('#siteHeader');
        if (header) {
            const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
            window.addEventListener('scroll', onScroll, { passive: true });
            onScroll();
        }

        const menu = $('#mobileMenu');
        const open = () => { menu.classList.remove('hidden'); document.body.style.overflow = 'hidden'; };
        const close = () => { menu.classList.add('hidden'); document.body.style.overflow = ''; };
        $('#menuBtn')?.addEventListener('click', open);
        $$('[data-close-menu]').forEach(el => el.addEventListener('click', close));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

        // کاربر واردشده (از سرور)
        const me = window.__ME__ || null;
        const link = $('#accountLink');
        if (me && link) {
            link.setAttribute('href', window.__STATIC__ ? 'orders.html' : 'orders.php');
            link.setAttribute('title', me.name);
            link.classList.add('text-gold-600');
        }

        // نرخ طلا (نمایشی، با نوسان جزئی)
        const rate = $('#goldRate');
        if (rate) {
            let value = 5250000;
            setInterval(() => {
                value += Math.round((Math.random() - 0.45) * 4000);
                rate.textContent = toman(value);
            }, 4000);
        }

        // انیمیشن ظاهر شدن
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
            }, { threshold: 0.12 });
            $$('.reveal').forEach(el => io.observe(el));
        } else {
            $$('.reveal').forEach(el => el.classList.add('in'));
        }
    }

    /* ---------- قالب کارت محصول (برای محصولات تازهٔ افزوده‌شده در پنل) ---------- */
    function cardHTML(p) {
        const out = p.stock <= 0;
        const off = p.old ? Math.round((p.old - p.price) / p.old * 100) : 0;
        // در نسخهٔ استاتیک صفحهٔ محصولِ تازه‌ساخته وجود ندارد؛ پیوند نمی‌گذاریم
        const href = window.__STATIC__
            ? (p._new ? '' : `product-${encodeURIComponent(p.sku)}.html`)
            : `product.php?sku=${encodeURIComponent(p.sku)}`;
        return `
        <article class="product-card group bg-white rounded-3xl overflow-hidden border border-ink-100 shadow-card reveal in"
                 data-sku="${p.sku}" data-cat="${p.cat}" data-name="${p.name}"
                 data-price="${p.price}" data-stock="${p.stock}" data-rating="${p.rating || 4.5}" data-date="0">
            <div class="relative overflow-hidden bg-cream">
                <img src="${p.img || 'image.php?sku=' + encodeURIComponent(p.sku)}" alt="${p.name}" loading="lazy"
                     class="product-img w-full aspect-square object-cover ${out ? 'grayscale opacity-60' : ''}">
                ${off ? `<span class="absolute top-3 start-3 rounded-full bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1">${faDigits(off)}٪‌ تخفیف</span>` : ''}
                <button type="button" class="absolute bottom-3 end-3 h-10 w-10 grid place-items-center rounded-full bg-white/90 text-ink-700 shadow-soft opacity-0 group-hover:opacity-100 transition hover:text-rose-500" title="افزودن به علاقه‌مندی‌ها">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20z"/></svg>
                </button>
                ${out ? `<span data-stock-overlay class="absolute inset-0 grid place-items-center"><span class="px-4 py-1.5 rounded-full bg-ink-900/85 text-white text-xs font-bold">ناموجود</span></span>` : ''}
            </div>
            <div class="p-5">
                <div class="flex items-center justify-between text-[11px] text-ink-400 mb-2">
                    <span class="rounded-md bg-ink-50 px-2 py-0.5">${p.cat}</span>
                    <span>کد ${p.sku}</span>
                </div>
                <h3 class="font-bold text-ink-900 leading-7 line-clamp-2 min-h-[3.5rem]">
                    ${href
                        ? `<a href="${href}" class="hover:text-gold-600 transition">${p.name}</a>`
                        : `<span>${p.name}</span>`}
                </h3>
                <div class="flex items-center gap-2 mt-2 text-xs text-ink-400">
                    <span class="stars" style="--rating:${p.rating || 4.5}"></span>
                    <span>${faDigits((p.rating || 4.5).toFixed(1))}</span>
                </div>
                <div class="mt-4 flex items-end justify-between gap-2">
                    <div>
                        ${p.old ? `<div class="text-xs text-ink-400 line-through">${toman(p.old)}</div>` : ''}
                        <div class="font-extrabold text-ink-900">${toman(p.price)} <span class="text-xs font-medium text-ink-500">تومان</span></div>
                    </div>
                    <button type="button" data-add="${p.sku}" ${out ? 'disabled' : ''}
                            class="h-10 px-4 rounded-xl text-sm font-bold transition ${out
                                ? 'bg-ink-100 text-ink-400 cursor-not-allowed'
                                : 'bg-ink-900 text-gold-300 hover:bg-gold-500 hover:text-ink-900'}">
                        ${out ? 'ناموجود' : 'افزودن'}
                    </button>
                </div>
            </div>
        </article>`;
    }

    // در نسخهٔ استاتیک برای ساختن کارت محصولات تازه‌افزوده لازم است
    window.__cardHTML__ = cardHTML;

    /* ---------- همگام‌سازی با ویترین ----------
       محصولات از دیتابیس رندر می‌شوند؛ تغییرات پنل مدیریت با
       بارگذاری مجدد صفحه اعمال می‌شود. */
    function applyAdminToStorefront() {
        // در نسخهٔ استاتیک گرید از localStorage همگام می‌شود
        if (window.__STATIC_SYNC_GRID__) window.__STATIC_SYNC_GRID__();
    }

    /* ---------- ویترین محصولات: فیلتر، جست‌وجو، مرتب‌سازی ---------- */
    function initCatalog() {
        const grid = $('[data-product-grid]');
        if (!grid) return;

        applyAdminToStorefront();

        const state = {
            cats: new Set(($('[data-cat]')?.value || '').split(',').filter(Boolean)),
            metals: new Set(),
            karats: new Set(),
            max: Infinity,
            sort: $('#sortSelect')?.value || 'default',
            q: ($('[data-q]')?.value || '').trim().toLowerCase()
        };

        $('#catalogQ')?.addEventListener('input', e => {
            state.q = e.target.value.trim().toLowerCase();
            apply();
        });
        const maxRange = $('#priceRange');
        if (maxRange) state.max = Number(maxRange.dataset.maxPrice);

        const cards = () => $$('.product-card', grid);

        function matches(card) {
            const p = {
                name: card.dataset.name.toLowerCase(),
                sku: card.dataset.sku.toLowerCase(),
                cat: card.dataset.cat,
                price: Number(card.dataset.price),
                metal: card.dataset.metal || '',
                karat: Number(card.dataset.karat || 18),
                stock: Number(card.dataset.stock)
            };
            if (state.q && !(p.name.includes(state.q) || p.sku.includes(state.q) || p.cat.includes(state.q))) return false;
            if (state.cats.size && !state.cats.has(p.cat)) return false;
            if (state.metals.size && !state.metals.has(p.metal)) return false;
            if (state.karats.size && !state.karats.has(String(p.karat))) return false;
            if (p.price > state.max) return false;
            return true;
        }

        function apply() {
            let visible = 0;
            cards().forEach(card => {
                const ok = matches(card);
                card.classList.toggle('hidden', !ok);
                if (ok) visible++;
            });

            const sorted = cards().sort((a, b) => {
                const A = a.dataset, B = b.dataset;
                switch (state.sort) {
                    case 'price-asc':  return Number(A.price) - Number(B.price);
                    case 'price-desc': return Number(B.price) - Number(A.price);
                    case 'rating':     return Number(B.rating) - Number(A.rating);
                    case 'new':        return Number(B.date) - Number(A.date);
                    default:           return 0;
                }
            });
            sorted.forEach(c => grid.appendChild(c));

            $('#resultCount') && ($('#resultCount').textContent = faDigits(visible));
            $('#emptyState')?.classList.toggle('hidden', visible > 0);
        }

        // چک‌باکس‌های فیلتر
        $$('[data-filter-metal]').forEach(cb => cb.addEventListener('change', () => {
            cb.checked ? state.metals.add(cb.value) : state.metals.delete(cb.value);
            apply();
        }));
        $$('[data-filter-karat]').forEach(cb => cb.addEventListener('change', () => {
            cb.checked ? state.karats.add(cb.value) : state.karats.delete(cb.value);
            apply();
        }));
        $$('[data-filter-cat]').forEach(cb => cb.addEventListener('change', () => {
            cb.checked ? state.cats.add(cb.value) : state.cats.delete(cb.value);
            apply();
        }));

        // بازهٔ قیمت
        if (maxRange) {
            const label = $('#priceLabel');
            const sync = () => {
                state.max = Number(maxRange.value);
                maxRange.style.setProperty('--pct', (maxRange.value / maxRange.max * 100) + '%');
                if (label) label.textContent = 'تا ' + toman(maxRange.value) + ' تومان';
                apply();
            };
            maxRange.addEventListener('input', sync);
            sync();
        }

        $('#sortSelect')?.addEventListener('change', e => { state.sort = e.target.value; apply(); });

        // پاک کردن فیلترها
        $('#clearFilters')?.addEventListener('click', () => {
            state.cats.clear(); state.metals.clear(); state.karats.clear();
            state.max = Number(maxRange?.dataset.maxPrice || Infinity);
            $$('[data-filter-cat],[data-filter-metal],[data-filter-karat]').forEach(cb => (cb.checked = false));
            if (maxRange) maxRange.value = maxRange.dataset.maxPrice;
            $('#sortSelect') && ($('#sortSelect').value = 'default');
            state.sort = 'default';
            maxRange?.dispatchEvent(new Event('input'));
            apply();
        });

        $('#filterToggle')?.addEventListener('click', () => {
            $('#filterPanel')?.classList.toggle('hidden');
        });

        apply();
    }

    /* ---------- صفحهٔ محصول ---------- */
    function initProduct() {
        const page = $('[data-product-page]');
        if (!page) return;

        const main = $('#mainImage');
        $$('.thumb').forEach(t => t.addEventListener('click', () => {
            $$('.thumb').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            if (main) { main.src = t.dataset.src; main.classList.add('opacity-0'); setTimeout(() => main.classList.remove('opacity-0'), 120); }
        }));

        const qtyEl = $('#qtyValue');
        $('#qtyPlus')?.addEventListener('click', () => { qtyEl.textContent = faDigits(Math.min(9, Number(qtyEl.textContent) + 1)); });
        $('#qtyMinus')?.addEventListener('click', () => { qtyEl.textContent = faDigits(Math.max(1, Number(qtyEl.textContent) - 1)); });

        $('#buyNow')?.addEventListener('click', () => {
            Cart.add(page.dataset.sku, Number(qtyEl.textContent));
            setTimeout(() => (window.location.href = window.__STATIC__ ? 'checkout.html' : 'checkout.php'), 350);
        });

        $$('.tab').forEach(tab => tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            $('#' + tab.dataset.tab)?.classList.add('active');
        }));
    }

    /* ---------- صفحهٔ سبد خرید ---------- */
    function initCartPage() {
        const root = $('[data-cart-page]');
        if (!root) return;

        function render() {
            const lines = Cart.lines();
            const tbody = $('#cartRows');
            const empty = $('#cartEmpty');
            const box   = $('#cartBox');
            tbody.innerHTML = '';

            if (!lines.length) {
                empty.classList.remove('hidden');
                box.classList.add('hidden');
                return;
            }
            empty.classList.add('hidden');
            box.classList.remove('hidden');

            lines.forEach(l => {
                tbody.insertAdjacentHTML('beforeend', `
                <tr class="border-b border-ink-100 last:border-0" data-row="${l.sku}">
                    <td class="py-4 ps-2">
                        <div class="flex items-center gap-4">
                            <img src="image.php?sku=${encodeURIComponent(l.sku)}" alt="" class="h-20 w-20 rounded-2xl object-cover border border-ink-100 bg-cream">
                            <div>
                                <a href="product.php?sku=${encodeURIComponent(l.sku)}" class="font-bold text-ink-900 hover:text-gold-600 transition">${l.product.name}</a>
                                <div class="text-xs text-ink-400 mt-1">کد ${l.sku} · ${toman(l.product.price)} تومان</div>
                            </div>
                        </div>
                    </td>
                    <td class="py-4">
                        <div class="inline-flex items-center rounded-xl border border-ink-200 overflow-hidden">
                            <button class="h-9 w-9 hover:bg-ink-50 text-lg" data-dec="${l.sku}">−</button>
                            <span class="h-9 w-10 grid place-items-center text-sm font-bold">${faDigits(l.qty)}</span>
                            <button class="h-9 w-9 hover:bg-ink-50 text-lg" data-inc="${l.sku}">+</button>
                        </div>
                    </td>
                    <td class="py-4 text-sm text-ink-500">${faDigits(l.product.weight)} گرم</td>
                    <td class="py-4 pe-2 text-left font-extrabold text-ink-900">${toman(l.product.price * l.qty)}</td>
                    <td class="py-4 pe-2 text-left">
                        <button class="h-9 w-9 grid place-items-center rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50" data-del="${l.sku}" title="حذف">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                        </button>
                    </td>
                </tr>`);
            });

            const sub = Cart.subtotal();
            $('#sumItems').textContent  = toman(sub);
            $('#sumTotal').textContent  = toman(sub + SHIPPING);
            $('#sumOff') && ($('#sumOff').textContent = toman(0));
        }

        root.addEventListener('click', e => {
            const dec = e.target.closest('[data-del], [data-inc], [data-dec]');
            if (!dec) return;
            const sku = dec.dataset.del || dec.dataset.inc || dec.dataset.dec;
            const row = Cart.items().find(i => i.sku === sku);
            if (dec.dataset.del) Cart.remove(sku);
            else if (dec.dataset.inc && row) Cart.update(sku, row.qty + 1);
            else if (dec.dataset.dec && row) Cart.update(sku, row.qty - 1);
            render();
        });

        $('#couponBtn')?.addEventListener('click', () => {
            const code = ($('#couponInput')?.value || '').trim().toUpperCase();
            toast(code === 'MEHRGOLD' ? 'کد تخفیف ۵٪ی شما اعمال شد' : 'کد تخفیف معتبر نیست (آزمایشی: MEHRGOLD)');
        });

        document.addEventListener('cart:change', render);
        render();
    }

    /* ---------- پرداخت (شبیه‌سازی‌شده) ---------- */
    function initCheckout() {
        const root = $('[data-checkout]');
        if (!root) return;

        const lines = Cart.lines();
        if (!lines.length) {
            root.innerHTML = `
            <div class="text-center py-20">
                <div class="mx-auto h-16 w-16 grid place-items-center rounded-full bg-ink-100 text-ink-400 mb-4">
                    <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h12l1.4 12.2a2 2 0 0 1-2 2.2H6.6a2 2 0 0 1-2-2.2z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
                </div>
                <h2 class="text-xl font-extrabold text-ink-900">سبد خرید شما خالی است</h2>
                <p class="text-ink-500 mt-2 text-sm">پیش از ثبت سفارش، چند محصول به سبد اضافه کنید.</p>
                <a href="products.php" class="inline-block mt-6 px-6 py-3 rounded-xl bg-ink-900 text-gold-300 font-bold text-sm hover:bg-gold-500 hover:text-ink-900 transition">مشاهدهٔ محصولات</a>
            </div>`;
            return;
        }

        const sub = Cart.subtotal();
        $('#ckItems').textContent = toman(sub);
        $('#ckShip').textContent  = SHIPPING ? toman(SHIPPING) : 'رایگان';
        $('#ckTotal').textContent = toman(sub + SHIPPING);

        const linesBox = $('#ckLines');
        if (linesBox) {
            linesBox.innerHTML = Cart.lines().map(l => `
                <div class="flex items-center gap-3">
                    <img src="image.php?sku=${encodeURIComponent(l.sku)}" alt="" class="h-14 w-14 rounded-xl object-cover border border-white/10">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-bold truncate">${l.product.name}</div>
                        <div class="text-[11px] text-ink-400">${faDigits(l.qty)} × ${toman(l.product.price)}</div>
                    </div>
                    <div class="text-sm font-bold text-gold-300">${toman(l.product.price * l.qty)}</div>
                </div>`).join('');
        }

        $$('[name="payment"]').forEach(r => r.addEventListener('change', () => {
            $('#cardNote').classList.toggle('hidden', r.value !== 'card');
        }));

        $('#payForm')?.addEventListener('submit', e => {
            e.preventDefault();
            const form = e.target;
            if (!form.checkValidity()) { form.reportValidity(); return; }

            const steps = $$('.steps .step');
            steps[0].classList.add('done');
            $('#payBtn').disabled = true;
            $('#payBtn').textContent = 'در حال اتصال به درگاه بانکی...';

            const data = new URLSearchParams(new FormData(form));

            setTimeout(async () => {
                steps[0].classList.remove('current');
                steps[1].classList.add('done', 'current');
                $('#payBtn').textContent = 'ثبت سفارش در دیتابیس...';

                let out;
                try {
                    if (window.__STATIC_CHECKOUT__) {
                        out = await window.__STATIC_CHECKOUT__(data);
                    } else {
                        const res = await fetch('checkout.php', {
                            method: 'POST',
                            headers: { 'X-CSRF-Token': window.__CSRF__ || '' },
                            body: data
                        });
                        out = await res.json();
                    }
                } catch (err) {
                    out = { ok: false, error: 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.' };
                }

                if (!out.ok) {
                    steps.forEach(s => s.classList.remove('done', 'current'));
                    steps[0].classList.add('current');
                    $('#payBtn').disabled = false;
                    $('#payBtn').textContent = 'پرداخت و ثبت نهایی سفارش';
                    toast(out.error || 'خطا در ثبت سفارش');
                    return;
                }

                steps[1].classList.remove('current');
                steps[2].classList.add('done', 'current');

                Cart.clear();

                $('#payStage').classList.add('hidden');
                $('#successStage').classList.remove('hidden');
                $('#orderIdText').textContent = faDigits(out.code);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 1200);
        });
    }

    /* ---------- ورود / ثبت‌نام (ارسال واقعی به سرور) ---------- */
    function initAuth() {
        const box = $('[data-auth]');
        if (!box) return;
        // فرم به‌صورت عادی به سرور ارسال می‌شود؛ فقط محدودیت مرورگر را رعایت می‌کنیم
        box.addEventListener('submit', e => {
            const form = e.target;
            if (!form.checkValidity()) {
                e.preventDefault();
                form.reportValidity();
            }
        });
    }

    /* ---------- سفارش‌ها ---------- */
    const STATUS = {
        pending:    ['در انتظار پرداخت', 'bg-amber-100 text-amber-700'],
        processing: ['در حال پردازش', 'bg-sky-100 text-sky-700'],
        shipped:    ['ارسال شده', 'bg-indigo-100 text-indigo-700'],
        delivered:  ['تحویل شده', 'bg-emerald-100 text-emerald-700'],
        cancelled:  ['لغو شده', 'bg-rose-100 text-rose-700']
    };

    function initOrders() {
        const root = $('[data-orders]');
        if (!root) return;
        const me = window.__ME__ || null;

        if (me) {
            $('#helloUser') && ($('#helloUser').textContent = me.name);
            $('#guestBox')?.classList.add('hidden');
        }

        const list = $('#orderList');
        list.innerHTML = '';

        const all = window.__ORDERS__ || [];
        all.forEach(o => {
            const st = STATUS[o.status] || STATUS.processing;
            const rows = (o.items || []).map(it => {
                const p = findProduct(it.sku);
                const name  = p ? p.name : (it.name || it.sku);
                const unit  = p ? p.price : (it.price || 0);
                return `
                <div class="flex items-center gap-3 py-3 border-t border-ink-100">
                    <img src="${(p && p.img) || 'image.php?sku=' + encodeURIComponent(it.sku)}" alt="" class="h-14 w-14 rounded-xl object-cover border border-ink-100 bg-cream">
                    <div class="flex-1">
                        <div class="font-bold text-sm text-ink-900">${name}</div>
                        <div class="text-xs text-ink-400">کد ${it.sku} · تعداد ${faDigits(it.qty)}</div>
                    </div>
                    <div class="font-bold text-sm">${toman(unit * it.qty)}</div>
                </div>`;
            }).join('');

            list.insertAdjacentHTML('beforeend', `
            <article class="bg-white rounded-3xl border border-ink-100 shadow-card overflow-hidden">
                <header class="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-ink-50/70">
                    <div class="text-sm">
                        <span class="text-ink-400">شمارهٔ سفارش:</span>
                        <span class="font-extrabold text-ink-900">${faDigits(o.id)}</span>
                        <span class="mx-2 text-ink-300">|</span>
                        <span class="text-ink-400">${o.date}</span>
                    </div>
                    <span class="text-xs font-bold px-3 py-1 rounded-full ${st[1]}">${st[0]}</span>
                </header>
                <div class="px-5 pb-4">
                    ${rows}
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-4">
                        <div class="text-xs text-ink-500 leading-6">
                            <div>نشانی: ${o.address || '—'}</div>
                            <div>پرداخت: ${o.payment || '—'} · کد رهگیری: ${faDigits(o.tracking || '—')}</div>
                        </div>
                        <div class="text-left">
                            <div class="text-xs text-ink-400">مبلغ کل</div>
                            <div class="font-extrabold text-ink-900">${toman(o.total)}</div>
                        </div>
                    </div>
                    <details class="mt-3 rounded-2xl bg-cream border border-ink-100 px-4 py-3">
                        <summary class="cursor-pointer text-sm font-bold text-ink-700 select-none">جزئیات مراحل سفارش</summary>
                        <ol class="mt-3 space-y-2 text-xs text-ink-500">
                            ${(o.history || []).map(h => `<li class="flex justify-between gap-4"><span class="text-ink-700">${h.label}</span><span>${h.date}</span></li>`).join('')}
                        </ol>
                    </details>
                </div>
            </article>`);
        });
    }

    /* ---------- پنل مدیریت ---------- */
    function initAdmin() {
        const root = $('[data-admin]');
        if (!root) return;

        /* تب‌ها */
        $$('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => {
            $$('[data-admin-tab]').forEach(b => b.classList.remove('bg-white', 'text-ink-900', 'shadow-soft'));
            btn.classList.add('bg-white', 'text-ink-900', 'shadow-soft');
            $$('[data-admin-panel]').forEach(p => p.classList.add('hidden'));
            $('#panel-' + btn.dataset.adminTab)?.classList.remove('hidden');
        }));

        /* آمار */
        const products = allProducts();
        const orders = window.__ORDERS__ || [];
        const set = (id, val) => { const el = $(id); if (el) el.textContent = faDigits(val); };
        set('#stProducts', products.length);
        set('#stLow', products.filter(p => p.stock > 0 && p.stock <= 2).length);
        set('#stOut', products.filter(p => p.stock <= 0).length);
        set('#stOrders', orders.length);
        set('#stRevenue', toman(orders.reduce((s, o) => s + Number(o.total || 0), 0)));
        set('#stUsers', '۱٬۲۸۴');

        /* جدول محصولات */
        function renderProducts() {
            const term = ($('#adminSearch')?.value || '').trim().toLowerCase();
            const rows = allProducts().filter(p => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
            const body = $('#adminProducts');
            body.innerHTML = rows.map(p => `
                <tr class="border-t border-ink-100 hover:bg-cream/60">
                    <td class="py-3 ps-4"><input type="checkbox" class="accent-gold-500 w-4 h-4"></td>
                    <td class="py-3">
                        <div class="flex items-center gap-3">
                            <img src="image.php?sku=${encodeURIComponent(p.sku)}" alt="" class="h-11 w-11 rounded-lg object-cover border border-ink-100 bg-cream">
                            <div>
                                <div class="font-bold text-sm text-ink-900">${p.name}</div>
                                <div class="text-[11px] text-ink-400">${p.cat} · ${faDigits(p.karat || 18)} عیار</div>
                            </div>
                        </div>
                    </td>
                    <td class="py-3 text-xs text-ink-400">${p.sku}</td>
                    <td class="py-3 text-sm font-bold">${toman(p.price)}</td>
                    <td class="py-3">
                        <div class="inline-flex items-center rounded-lg border border-ink-200 overflow-hidden bg-white">
                            <button class="h-8 w-8 hover:bg-ink-50" data-stock-dec="${p.sku}">−</button>
                            <span class="h-8 w-9 grid place-items-center text-sm font-bold ${p.stock <= 0 ? 'text-rose-600' : ''}">${faDigits(p.stock)}</span>
                            <button class="h-8 w-8 hover:bg-ink-50" data-stock-inc="${p.sku}">+</button>
                        </div>
                    </td>
                    <td class="py-3">
                        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${p.stock <= 0 ? 'bg-rose-100 text-rose-600' : p.stock <= 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">
                            ${p.stock <= 0 ? 'ناموجود' : p.stock <= 2 ? 'موجودی کم' : 'موجود'}
                        </span>
                    </td>
                    <td class="py-3 pe-4 text-left whitespace-nowrap">
                        <button class="px-3 h-8 rounded-lg text-xs font-bold bg-ink-900 text-gold-300 hover:bg-gold-500 hover:text-ink-900 transition" data-edit="${p.sku}">ویرایش</button>
                        <button class="px-3 h-8 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition" data-delete="${p.sku}">حذف</button>
                    </td>
                </tr>`).join('');

            $('#adminEmpty')?.classList.toggle('hidden', rows.length > 0);
        }

        async function bumpStock(sku, delta) {
            const current = allProducts().find(p => p.sku === sku);
            if (!current) return;
            const out = await api('admin.php?action=stock', { sku, delta });
            if (!out.ok) { toast(out.error || 'خطا در به‌روزرسانی موجودی'); return; }
            const next = Math.max(0, Number(current.stock) + delta);
            current.stock = next;
            renderProducts();
            updateStats();
            toast('موجودی «' + current.name + '» به ' + faDigits(next) + ' رسید');
        }

        function updateStats() {
            const products = allProducts();
            set('#stProducts', products.length);
            set('#stLow', products.filter(p => p.stock > 0 && p.stock <= 2).length);
            set('#stOut', products.filter(p => p.stock <= 0).length);
        }

        root.addEventListener('click', async e => {
            const inc = e.target.closest('[data-stock-inc]');
            const dec = e.target.closest('[data-stock-dec]');
            const del = e.target.closest('[data-delete]');
            const edit = e.target.closest('[data-edit]');
            if (edit) {
                const p = allProducts().find(x => x.sku === edit.dataset.edit);
                if (!p) return;
                const form = $('#addProductForm');
                document.getElementById('addForm')?.classList.remove('hidden');
                form.dataset.editing = p.sku;
                form.pname.value = p.name;
                form.psku.value = p.sku;
                form.psku.disabled = true;
                form.pcat.value = p.cat;
                form.pprice.value = p.price;
                form.pstock.value = p.stock;
                form.pkarat.value = p.karat || 18;
                form.pweight.value = p.weight || 1;
                $('#addProductTitle').textContent = 'ویرایش محصول ' + p.sku;
                $('#addProductBtn').textContent = 'ذخیرهٔ تغییرات';
                form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (inc) bumpStock(inc.dataset.stockInc, +1);
            if (dec) bumpStock(dec.dataset.stockDec, -1);
            if (del) {
                const sku = del.dataset.delete;
                if (!confirm('محصول «' + sku + '» از ویترین حذف شود؟')) return;
                const out = await api('admin.php?action=delete', { sku });
                if (!out.ok) { toast(out.error || 'خطا در حذف'); return; }
                window.__ADMIN_PRODUCTS__ = out.products;
                renderProducts(); updateStats();
                toast('محصول از ویترین حذف شد');
            }
        });

        $('#adminSearch')?.addEventListener('input', renderProducts);

        /* افزودن / ویرایش محصول (با آپلود تصویر) */
        $('#addProductForm')?.addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target;
            const fd = new FormData(f);

            if (f.dataset.editing) {
                fd.set('existing', f.dataset.editing);
                fd.set('psku', f.dataset.editing);
            }
            if (!fd.get('psku')) fd.set('psku', 'X-' + Math.floor(100 + Math.random() * 899));

            const btn = $('#addProductBtn');
            const oldLabel = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'در حال ذخیره...';

            let out;
            try {
                if (window.__STATIC_SAVE__) {
                    out = await window.__STATIC_SAVE__(fd);
                } else {
                    const res = await fetch('admin.php?action=save', {
                        method: 'POST',
                        headers: { 'X-CSRF-Token': window.__CSRF__ || '' },
                        body: fd
                    });
                    out = await res.json();
                }
            } catch (err) {
                out = { ok: false, error: 'ارتباط با سرور برقرار نشد' };
            }

            btn.disabled = false;
            btn.textContent = oldLabel;
            if (!out.ok) { toast(out.error || 'خطا در ذخیرهٔ محصول'); return; }

            window.__ADMIN_PRODUCTS__ = out.products;
            delete f.dataset.editing;
            f.psku.disabled = false;
            f.reset();
            $('#addProductTitle').textContent = 'افزودن محصول جدید';
            $('#addProductBtn').textContent = 'ثبت محصول';
            renderProducts(); updateStats();
            toast('محصول با کد ' + faDigits(out.sku) + ' ذخیره شد');
        });

        /* سفارش‌ها */
        function renderOrders() {
            const filter = $('#orderFilter')?.value || 'all';
            const all = window.__ORDERS__ || [];
            const rows = all.filter(o => filter === 'all' || o.status === filter);
            $('#adminOrders').innerHTML = rows.map((o) => {
                const st = STATUS[o.status] || STATUS.processing;
                return `
                <tr class="border-t border-ink-100 hover:bg-cream/60">
                    <td class="py-3 ps-4 font-bold text-sm">${faDigits(o.id)}</td>
                    <td class="py-3 text-sm text-ink-500">${o.date}</td>
                    <td class="py-3 text-sm">${(o.items || []).length} قلم</td>
                    <td class="py-3 font-bold text-sm">${toman(o.total)}</td>
                    <td class="py-3"><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${st[1]}">${st[0]}</span></td>
                    <td class="py-3 pe-4">
                        <select class="field !h-9 !ps-3 text-xs w-36" data-order-status="${o.int_id}">
                            ${Object.keys(STATUS).map(k => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}
                        </select>
                    </td>
                </tr>`;
            }).join('');
        }

        $('#orderFilter')?.addEventListener('change', renderOrders);
        $('#adminOrders')?.addEventListener('change', async e => {
            const sel = e.target.closest('[data-order-status]');
            if (!sel) return;
            const out = await api('admin.php?action=status', { id: Number(sel.dataset.orderStatus), status: sel.value });
            if (!out.ok) { toast(out.error || 'خطا در تغییر وضعیت'); return; }
            window.__ORDERS__ = out.orders;
            toast('وضعیت سفارش به «' + sel.options[sel.selectedIndex].text + '» تغییر کرد');
        });

        renderProducts();
        renderOrders();
    }

    /* ---------- افزودن به سبد و علاقه‌مندی‌ها (سراسری) ---------- */
    function initAddToCart() {
        document.addEventListener('click', e => {
            const wish = e.target.closest('[data-wish]');
            if (wish) {
                e.preventDefault();
                wish.classList.toggle('is-on');
                toast(wish.classList.contains('is-on') ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
                return;
            }

            const btn = e.target.closest('[data-add]');
            if (!btn || btn.disabled) return;

            let qty = 1;
            const qtyEl = $('#qtyValue');
            if (qtyEl && btn.closest('[data-product-page]')) {
                qty = parseInt(qtyEl.textContent.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)), 10) || 1;
            }
            Cart.add(btn.dataset.add, qty);
        });
    }

    /* ---------- اجرای سراسری ---------- */
    document.addEventListener('DOMContentLoaded', () => {
        Cart.render();
        initChrome();
        initAddToCart();
        initCatalog();
        initProduct();
        initCartPage();
        initCheckout();
        initAuth();
        initOrders();
        initAdmin();
    });
})();
