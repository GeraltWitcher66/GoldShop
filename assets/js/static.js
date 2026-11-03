/**
 * لایهٔ اجرای نسخهٔ استاتیک (GitHub Pages)
 * ---------------------------------------------------------------
 * در این حالت سروری در کار نیست؛ همهٔ چیزهایی که به بک‌اند نیاز داشتند
 * با localStorage مرورگر شبیه‌سازی می‌شوند:
 *   - سبد خرید          → localStorage
 *   - ورود / ثبت‌نام     → localStorage (نمایشی، بدون امنیت واقعی)
 *   - ثبت سفارش         → localStorage + کاهش موجودی محلی
 *   - پنل مدیریت        → localStorage (تغییرات فقط در همین مرورگر)
 * داده‌های محصولات از همان JSON ساخته‌شده در زمان build خوانده می‌شود.
 */
(function () {
    'use strict';
    if (!window.__STATIC__) return;

    var USER_KEY = 'mehrghan_static_user_v1';
    var PROD_KEY = 'mehrghan_static_products_v1';
    var ORD_KEY  = 'mehrghan_static_orders_v1';

    function get(key, fallback) {
        try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
        catch (e) { return fallback; }
    }
    function set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

    /* ---------------- کاربر واردشده ---------------- */
    var me = get(USER_KEY, null);
    if (me) window.__ME__ = me;

    /* سبد خرید ذخیره‌شده در مرورگر جایگزین سبد سرور می‌شود */
    window.__CART__ = get('mehrghan_cart_v1', []);

    /* ---------------- محصولات: دادهٔ build + تغییرات مدیر ---------------- */
    var base = (window.__PRODUCTS__ || []).map(function (p) { return Object.assign({}, p); });
    var changes = get(PROD_KEY, {});

    function currentProducts() {
        var list = [];
        base.forEach(function (p) {
            var c = changes[p.sku];
            if (c && c._deleted) return;
            list.push(c ? Object.assign({}, p, c) : p);
        });
        Object.keys(changes).forEach(function (sku) {
            var c = changes[sku];
            if (c && c._new && !c._deleted) list.push(Object.assign({}, c));
        });
        return list;
    }
    function publish() {
        window.__PRODUCTS__ = currentProducts();
        window.__ADMIN_PRODUCTS__ = window.__PRODUCTS__;
    }
    publish();

    function findSku(sku) {
        return currentProducts().find(function (p) { return p.sku === sku; }) || null;
    }

    /* همگام‌سازی کارت‌های ویترین با تغییرات پنل مدیریت
       (کارت‌های اولیه را PHP ساخته؛ فقط محصولات تازه/حذف‌شده و موجودی به‌روز می‌شود) */
    window.__STATIC_SYNC_GRID__ = function () {
        var grid = document.querySelector('[data-product-grid]');
        if (!grid) return;

        currentProducts().forEach(function (p) {
            var card = grid.querySelector('.product-card[data-sku="' + p.sku + '"]');
            if (card) {
                card.dataset.stock = p.stock;
                return;
            }
            if (typeof window.__cardHTML__ === 'function') {
                grid.insertAdjacentHTML('beforeend', window.__cardHTML__(p));
            }
        });

        grid.querySelectorAll('.product-card').forEach(function (card) {
            if (!findSku(card.dataset.sku)) card.remove();
        });
    };

    /* ---------------- سفارش‌ها ---------------- */
    function orders() { return get(ORD_KEY, []); }
    function saveOrders(list) { set(ORD_KEY, list); window.__ORDERS__ = list; }
    saveOrders(orders());

    function todayFa() {
        try {
            return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
        } catch (e) { return ''; }
    }

    function placeholderImg(sku) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">'
            + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            + '<stop offset="0" stop-color="#fbf6ec"/><stop offset="1" stop-color="#f0e4cf"/></linearGradient></defs>'
            + '<rect width="600" height="600" fill="url(#g)"/>'
            + '<circle cx="300" cy="300" r="120" fill="none" stroke="#d9a441" stroke-width="10" opacity=".75"/>'
            + '<text x="300" y="315" text-anchor="middle" font-family="Vazirmatn,sans-serif" font-size="46" fill="#a9741f">'
            + String(sku || '').replace(/[<>&]/g, '') + '</text></svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    /* ---------------- API جایگزین سرور ---------------- */
    window.__STATIC_API__ = async function (url, data) {
        data = data || {};

        if (url.indexOf('cart.php') === 0) {
            return { ok: true, count: window.Cart ? Cart.count() : 0 };
        }

        if (url.indexOf('action=stock') > -1) {
            var item = findSku(data.sku);
            if (!item) return { ok: false, error: 'محصول یافت نشد' };
            var stock = Math.max(0, (parseInt(item.stock, 10) || 0) + (parseInt(data.delta, 10) || 0));
            changes[data.sku] = Object.assign({}, changes[data.sku], { stock: stock, _new: !!item._new });
            set(PROD_KEY, changes); publish();
            return { ok: true, stock: stock, products: window.__ADMIN_PRODUCTS__ };
        }

        if (url.indexOf('action=delete') > -1) {
            if (!findSku(data.sku)) return { ok: false, error: 'محصول یافت نشد' };
            changes[data.sku] = Object.assign({}, changes[data.sku], { _deleted: true });
            set(PROD_KEY, changes); publish();
            return { ok: true, products: window.__ADMIN_PRODUCTS__ };
        }

        if (url.indexOf('action=status') > -1) {
            var list = orders();
            list.forEach(function (o) {
                if (String(o.int_id) === String(data.id)) {
                    o.status = data.status;
                    o.history = (o.history || []).concat([{ label: 'تغییر وضعیت', date: todayFa() }]);
                }
            });
            saveOrders(list);
            return { ok: true, orders: list };
        }

        return { ok: false, error: 'این عملیات در حالت نمایشی پشتیبانی نمی‌شود' };
    };

    /* ذخیرهٔ محصول در پنل مدیریت (بدون آپلود تصویر) */
    window.__STATIC_SAVE__ = async function (fd) {
        var existing = String(fd.get('existing') || '');
        var sku = String(fd.get('psku') || existing || '').trim().toUpperCase();
        var name = String(fd.get('pname') || '').trim();
        var price = parseInt(fd.get('pprice'), 10) || 0;

        if (!name || price <= 0) return { ok: false, error: 'نام و قیمت محصول الزامی است.' };
        if (!sku) sku = 'X-' + Math.floor(100 + Math.random() * 899);

        var before = findSku(sku);
        if (before && !existing) return { ok: false, error: 'کد کالا تکراری است.' };

        var partial = {
            _new: !before || !!before._new,
            sku: sku,
            name: name,
            price: price,
            stock: parseInt(fd.get('pstock'), 10) || 0,
            cat: String(fd.get('pcat') || (before && before.cat) || 'انگشتر'),
            karat: parseInt(fd.get('pkarat'), 10) || (before && before.karat) || 18,
            weight: parseFloat(fd.get('pweight')) || (before && before.weight) || 1,
            old: before ? (before.old || 0) : 0,
            rating: before ? (before.rating || 4.5) : 4.5,
            img: before ? before.img : placeholderImg(sku),
            active: 1
        };

        changes[sku] = Object.assign({}, changes[sku], partial);
        set(PROD_KEY, changes); publish();

        return { ok: true, sku: sku, products: window.__ADMIN_PRODUCTS__ };
    };

    /* ثبت سفارش */
    window.__STATIC_CHECKOUT__ = async function (params) {
        var lines = window.Cart ? Cart.lines() : [];
        if (!lines.length) return { ok: false, error: 'سبد خرید شما خالی است.' };

        var subtotal = 0;
        var items = lines.map(function (l) {
            subtotal += l.product.price * l.qty;
            return { sku: l.sku, qty: l.qty, name: l.product.name, price: l.product.price };
        });

        var code = 'M-' + Math.floor(10000 + Math.random() * 90000);
        var payment = String(params.get('payment') || 'card') === 'cod'
            ? 'پرداخت در محل — تحویل در تهران'
            : 'پرداخت آنلاین — درگاه بانکی';

        var order = {
            id: code,
            int_id: Date.now(),
            date: todayFa(),
            status: 'pending',
            total: subtotal,
            subtotal: subtotal,
            discount: 0,
            payment: payment,
            address: String(params.get('address') || '—'),
            city: String(params.get('city') || ''),
            phone: String(params.get('phone') || ''),
            name: String(params.get('name') || ''),
            tracking: '—',
            items: items,
            history: [
                { label: 'ثبت سفارش', date: todayFa() },
                { label: 'در انتظار پرداخت', date: todayFa() }
            ]
        };

        items.forEach(function (it) {
            var cur = findSku(it.sku);
            if (!cur) return;
            changes[it.sku] = Object.assign({}, changes[it.sku], {
                stock: Math.max(0, (parseInt(cur.stock, 10) || 0) - it.qty),
                _new: !!cur._new
            });
        });
        set(PROD_KEY, changes); publish();

        saveOrders([order].concat(orders()));
        return { ok: true, code: code, total: subtotal };
    };

    /* ---------------- ورود / ثبت‌نام نمایشی ---------------- */
    document.addEventListener('submit', function (e) {
        var form = e.target && e.target.closest ? e.target.closest('[data-auth]') : null;
        if (!form) return;
        e.preventDefault();
        e.stopPropagation();

        var kind = form.getAttribute('data-auth');
        var fd = new FormData(form);
        var name = String(fd.get('name') || '').trim();
        var phone = String(fd.get('phone') || '').trim();
        var pass = String(fd.get('password') || '');
        var pass2 = String(fd.get('password2') || '');

        if (kind === 'register') {
            if (name.length < 3) { alert('نام و نام خانوادگی را کامل وارد کنید.'); return; }
            if (!/^[0-9]{10,11}$/.test(phone)) { alert('شمارهٔ موبایل معتبر نیست.'); return; }
            if (pass.length < 6) { alert('رمز عبور باید دست‌کم ۶ کاراکتر باشد.'); return; }
            if (pass !== pass2) { alert('تکرار رمز عبور مطابقت ندارد.'); return; }
        } else {
            if (!phone || !pass) { alert('شمارهٔ موبایل/ایمیل و رمز عبور را وارد کنید.'); return; }
            if (!name) name = 'مشتری مهرگان';
        }

        set(USER_KEY, {
            name: name,
            email: String(fd.get('email') || (phone + '@mehrghan.local')),
            role: 'user'
        });

        var next = new URLSearchParams(location.search).get('next') || 'orders.html';
        next = next.replace(/\.php(?=$|[?#])/, '.html').replace(/^\/+/, '');
        if (/^[a-z][a-z0-9+.-]*:/i.test(next) || next.indexOf('//') === 0) next = 'orders.html';
        location.href = next;
    }, true);

    /* خروج از حساب */
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href*="action=logout"]') : null;
        if (!a) return;
        e.preventDefault();
        try { localStorage.removeItem(USER_KEY); } catch (err) {}
        window.__ME__ = null;
        location.href = 'login.html';
    }, true);

    /* ---------------- اعمال پارامترهای آدرس در صفحهٔ فروشگاه ---------------- */
    (function applyShopParams() {
        if (!document.querySelector('[data-product-grid-page]')) return;
        var params = new URLSearchParams(location.search);

        var q = params.get('q');
        if (q) {
            var cq = document.getElementById('catalogQ');
            if (cq) cq.value = q;
            var side = document.getElementById('sideSearch');
            if (side) side.value = q;
        }

        var cat = params.get('cat');
        if (cat) {
            document.querySelectorAll('[data-filter-cat]').forEach(function (cb) {
                if (cb.value === cat) cb.checked = true;
            });
        }

        var sort = params.get('sort');
        if (sort) {
            var sel = document.getElementById('sortSelect');
            if (sel) sel.value = sort;
        }
    })();
})();
