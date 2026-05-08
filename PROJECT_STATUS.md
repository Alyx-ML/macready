# MacReady Project Status

## What This Site Is

MacReady is a dark, macOS-inspired site for Mac gaming and Apple software discovery. It combines Mac game compatibility data, Steam game details, user reports, Apple/Mac news, App Store app pages, macOS release notes, and CrossOver changelog/blog content in one interface.

The site should feel like a focused Mac app: quiet, compact, high contrast, fast, and polished. Avoid large marketing sections, decorative clutter, and badge-heavy layouts.

## Current Stack

- Frontend: React with Vite, currently Vite 8.0.11.
- Backend: Bun API server.
- Local frontend: `http://localhost:5173/`
- Local backend API: `http://localhost:8421/`
- Production target today: GitHub Pages for the static frontend.
- Important deployment constraint: GitHub Pages only serves files. It does not run the Bun backend, so any production behavior that needs backend data must use exported/static data or move to a host that can run the API.

## Main Site Sections

- News: Mac-focused Apple news only.
- Reviews: should avoid non-Mac review feeds.
- CrossOver: CodeWeavers changelog and CodeWeavers blog content only.
- Compatibility: Steam/Mac game compatibility database.
- AppStore: Apple App Store app chart/search/detail pages.
- MacOS Updates: embedded Apple Developer macOS Tahoe release notes.
- Trending: Apple/Mac-focused trending items.

## Content Source Rules

Do not use these in the general news API:

- Daring Fireball
- CodeWeavers blog
- TidBITS
- Six Colors

Do not use Cult of Mac for reviews because it includes too many non-Mac reviews.

The CrossOver section must not show generic Apple news. It should show only CrossOver changelog data and CodeWeavers blog posts.

## Current Feature Progress

### Compatibility

The Compatibility page has:

- Steam game cards.
- Game detail pages.
- Search.
- Carousel sections.
- Cached query behavior to reduce reload cost.
- First visible card batches are prioritized so mobile and desktop avoid blank gaps.
- A report submission direction with structured fields planned around Native, CrossOver, Parallels, GPTK, CrossOver version, D3DMetal/DXVK, chip, RAM, graphics preset, resolution, FPS, and notes.
- Hardware profiles are used for “My Mac” style compatibility estimates.

Recent terminology:

- “Platinum” was changed conceptually to “Native”.
- Native should mean confirmed Steam games with a native Apple Mac port.

### Account And Sign In

The account system supports:

- Email/password login.
- Passkey-only signup using Touch ID.
- Touch ID sign-in after a passkey-only account is created.
- Account display name editing.
- Hardware profiles.
- Removing Touch ID from the account.

Current expected Touch ID behavior:

- Creating an account with Touch ID should not ask for email, password, or username.
- The account can later be given a display name.
- The passkey identifier must not be shown to the user in the account page.
- Removing Touch ID shows a confirmation that removal will sign the user out.
- Removing Touch ID revokes the credential and signs the user out.

Recent account changes:

- Added backend profile update route: `PUT /api/v1/gamedb/auth/profile`.
- Added frontend profile update API helper.
- Added display name editing in the auth modal and account page.
- Changed “Remove Touch ID passkey” text to “Remove Touch ID”.
- Added signed-out state after removing Touch ID instead of abrupt close.
- Hardware profile fields now use dropdowns so submitted machine data is valid.

### Hardware Profiles

The Add Machine form now uses dropdowns for:

- Chip.
- Mac model.
- Memory.
- macOS version.
- GPU cores.

This keeps hardware data consistent enough for later compatibility estimates.

### App Store

The AppStore page has:

- App chart cards.
- App search UI.
- App detail pages.
- Compact latest version notes.
- Apple-style horizontal screenshot carousel.
- Shadow-scroll treatment to avoid large empty page gaps.

### macOS Updates

The MacOS Updates page should:

- Show macOS Tahoe/macOS 26 release notes only.
- Use embedded Apple Developer release notes.
- Use the same compact shadow-scroll feel as the other article/detail pages.
- Avoid redirect-only behavior for the changelog content.

### CrossOver

The CrossOver page should:

- Prioritize the CodeWeavers changelog.
- Include latest CodeWeavers blog posts.
- Keep the changelog and blog compact.
- Earlier changelog entries should link to their individual changelog pages instead of reinitializing the same page.

### Navigation And macOS Styling

The menu bar should stay stable and should not be part of page crossfades.

The site currently includes:

- macOS-style menu bar.
- Quick page crossfade on content.
- Dark glass calendar from the clock menu.
- Lock screen mode inspired by macOS Tahoe.
- Mobile safe-area work and horizontal navigation handling.

## Performance Work So Far

Recent performance work included:

- Better image loading behavior.
- Less aggressive video compression after the first pass made the video too pixelated.
- More careful lazy loading and card loading.
- Content visibility applied only to lower sections where it should not affect visible content.
- Faster animation timings in the 160-260ms range.
- Better text contrast and font smoothing.

Recent Lighthouse scores mentioned by the user:

- Desktop performance improved from 45 to 50, then to 81, then around 94.
- Mobile still needs continued layout and performance work.

Known performance areas still worth improving:

- Split unused JavaScript where it makes sense.
- Keep browser extensions out of Lighthouse interpretation when reviewing reports.
- Continue improving image sizes without visibly degrading hero media or video.
- Avoid preloading assets that are not immediately used.
- Keep compatibility card loading smooth on mobile.

## Important Design Constraints

- Keep UI compact and Mac-like.
- Avoid bloated cards, excessive badges, and decorative clutter.
- Do not put cards inside cards.
- Keep the menu bar stable.
- Preserve existing dark visual identity.
- Keep article text readable with strong contrast on black.
- Do not add fallback behavior. If something cannot work properly, fix the real issue.

## Current Verification

Most recent local checks:

- Frontend typecheck passed with `bun run typecheck`.
- Backend compile check passed with `bun build backend/server.ts --target bun --outfile /tmp/macready-server-check.js`.
- Local dev server was running at `http://localhost:5173/`.

## Next Good Tasks

Recommended next tasks for another agent:

- Verify Touch ID signup, Touch ID login, display name editing, and Remove Touch ID on localhost.
- Verify the account page no longer exposes the generated passkey identifier.
- Verify hardware profile dropdowns submit correctly and display saved machines.
- Check mobile layout for News, Compatibility, AppStore, and account pages.
- Fix CrossOver earlier changelog links if they still re-open the same page.
- Review GitHub Pages after deploy to make sure the pushed build is live.
- Continue Compatibility performance work without changing visual behavior.
