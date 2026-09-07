# سامانه مدیریت کارگاه — راه‌اندازی

## ۱. ساخت پروژه Supabase
1. یک پروژه جدید در [supabase.com](https://supabase.com) بسازید.
2. در **SQL Editor** محتوای فایل `sql/schema.sql` را اجرا کنید (تمام جدول‌ها، تریگرها و RLS را می‌سازد).
3. در **Authentication → Providers**، فقط Email/Password را فعال نگه دارید و **Allow new users to sign up** را خاموش کنید (چون ثبت‌نام عمومی نباید وجود داشته باشد).
4. در **Authentication → Users → Add user** یک کاربر برای خودتان (مالک) با ایمیل و رمز عبور بسازید.

### اگر پیام «Database error creating new user» دیدید
یک تریگر در پایگاه‌داده سعی می‌کند هنگام ساخت کاربر، یک ردیف در جدول `profiles` بسازد. اگر این مرحله با خطا مواجه شد:
1. در SQL Editor اجرا کنید: `select id, email from auth.users;` تا مطمئن شوید کاربر واقعاً ساخته شده یا نه.
2. اگر کاربر ساخته نشده، این را اجرا کنید تا موقتاً تریگر را غیرفعال کنید: `drop trigger if exists on_auth_user_created on auth.users;` سپس دوباره کاربر را بسازید.
3. سپس با uuid کاربر (از مرحله ۱)، ردیف پروفایل را دستی بسازید:
   ```sql
   insert into public.profiles (id, role) values ('UUID-کاربر-شما', 'owner');
   ```
4. با `select * from profiles;` مطمئن شوید یک ردیف با role='owner' دارید.

## ۲. اتصال فرانت‌اند
فایل `js/supabaseClient.js` را باز کنید و مقادیر زیر را از **Project Settings → API** جایگزین کنید:
```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```
فقط از کلید **anon/public** استفاده کنید؛ کلید service-role هرگز نباید در فرانت‌اند قرار بگیرد.

## ۳. اجرای محلی
چون از ماژول‌های ساده JS استفاده شده، کافی است فایل‌ها را با یک سرور استاتیک سرو کنید، مثلاً:
```bash
npx serve .
```
سپس آدرس `login.html` را باز کنید.

## ۴. دیپلوی
هر هاست استاتیک کار می‌کند: Netlify، Vercel، Cloudflare Pages، GitHub Pages. کافی است کل پوشه را آپلود کنید — نیازی به build step نیست.

## ساختار پوشه‌ها
```
/css/app.css          طراحی و رنگ‌بندی
/js/supabaseClient.js  اتصال به Supabase
/js/jalali.js          تبدیل تقویم شمسی/میلادی
/js/utils.js           توابع کمکی مشترک (toast، sheet، خطاها)
/js/auth.js            ورود/خروج
/js/dashboard.js        صفحه خانه
/js/workers.js          صفحه افراد
/js/inventory.js        صفحه مصالح
/js/tools.js            صفحه ابزار
/js/calendar.js         صفحه تقویم
/sql/schema.sql          اسکیمای کامل پایگاه‌داده
```

## نکات مهم درباره موجودی
- عدد موجودی هرگز مستقیم در پایگاه‌داده تغییر نمی‌کند؛ همیشه از جمع تراکنش‌ها (`inventory_transactions` / `tool_transactions`) توسط تریگر پایگاه‌داده محاسبه می‌شود.
- «اصلاح موجودی» یک تراکنش جدید با نوع `adjustment` می‌سازد و تاریخچه قبلی را پاک نمی‌کند.
- برای هر ماده/ابزار می‌توانید کل تاریخچه را در صفحه مربوطه ببینید.

## توسعه‌های آینده (طراحی‌شده ولی پیاده‌سازی‌نشده)
جدول `profiles.role` برای نقش‌های آینده (مدیر/کارگر معتمد) از قبل آماده است. برای افزودن آن‌ها فقط نیاز به تعریف policy های جدید RLS بر اساس `role` دارید، بدون تغییر ساختار جداول.
