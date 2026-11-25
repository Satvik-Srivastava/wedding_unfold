# unfold

A hand-drawn Indian wedding invitation inside a pop-up book. Each room celebrates an event;
open its card for the time, venue, family details, dress note, map and calendar options, or RSVP.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use the arrows, keyboard arrows, or a sideways drag to move through
the book. Open an event card by tapping the invitation in its room.

## Configure shared wedding settings

The admin editor saves wedding details and processed portraits to Supabase, so guests on other
devices see the same invitation. Set up Supabase once before running the app:

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill in the project's URL and publishable (or legacy
   anon) key from **Project Settings → API**. Never put a `service_role` or secret key in this app.
4. In **Authentication → Providers → Email**, disable public sign-ups.
5. In **Authentication → Users**, create the admin account with an email and password.
6. In the SQL Editor, mark that account as the wedding administrator, replacing the example email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"wedding_admin"}'::jsonb
   where email = 'admin@example.com';
   ```

7. Restart `npm run dev`, then sign in at http://localhost:3000/admin.

Enter the couple's names, parents' names, city, RSVP date and each celebration's details.
Portraits are stylized on the device and saved separately with the shared invitation. This
privacy-preserving browser filter keeps the uploaded face, hairstyle and outfit recognizable; it
does not generate new clothing or guarantee a full bridal/groom character transformation. Save to
publish your changes to guests. If this browser had settings from the earlier local-only version,
the admin editor offers to import them after you sign in.

RSVP replies remain local to the guest's browser; shared RSVP collection is not configured.

Personal links: `?to=the%20sharma%20family` writes a guest's name on the cover.

## The book

The original book folds open into one illustrated room for each part of the celebration, with
hand-drawn Indian wedding details including marigold garlands, a haldi courtyard, a mandap and
rangoli. The full-circle pages turn with the arrow controls, keyboard or a sideways drag.

## How it's built

Next.js App Router, React, React Three Fiber, drei, three.js and Caveat (`@fontsource/caveat`).
The room drawings are generated in code; there is no artwork asset folder.

| File | What it does |
|------|--------------|
| `app/page.tsx` | Public invitation. |
| `app/admin/page.tsx` | Signed-in editor for shared wedding details and portraits. |
| `app/globals.css` | Paper, invitation and responsive editor styles. |
| `lib/wedding.ts` | Wedding data types, defaults, parsing and formatting. |
| `lib/supabase.ts` | Supabase browser and server configuration. |
| `app/api/wedding/route.ts` | Public invitation reads and authenticated admin writes. |
| `supabase/schema.sql` | Shared settings table and row-level access policies. |
| `lib/portrait.ts` | On-device, hand-drawn portrait treatment. |
| `lib/invite.ts` | Event-room illustrations and book covers. |
| `lib/fold.ts` | Page angles, floor crease and camera geometry. |
| `components/Book.tsx` | The 3D pop-up book. |
| `components/Experience.tsx` | Canvas, navigation, captions and settings hydration. |
| `components/EventCard.tsx` | Event details, portraits, map and calendar actions. |
| `components/Rsvp.tsx` | RSVP form and local browser persistence. |
