# Readable training workspace

The user approved both dashboard concepts: soft light surfaces with blue/teal accents and neutral charcoal surfaces with a softer blue accent. Both use the same information hierarchy and controls.

## Findings and decisions

- The old stylesheet reduced many labels to 7–10 px and some mobile labels to 5–6 px. Body copy now uses a 16 px base; dense labels are at least 12 px, while forms use 16 px inputs. The type scale applies across the calendar, settings, activity details and dialogs.
- Similar dark green surfaces made page regions hard to distinguish. Both palettes now define separate page, card, navigation, control-border and text roles. Saturated color is reserved for actions and meaningful states.
- A large motivational illustration occupied the primary dashboard space. The first row now shows the current or next session, recorded versus target metrics, partial commute progress, and required weekly session completion. All values come from existing app data.
- The next session and calendar links have visible labels and distinct action styling. Main actions and theme controls have targets at least 44 px high. Keyboard focus uses a visible three-pixel outline.
- Light and dark use the same semantic status roles. Completed, partial and skipped states retain written labels alongside color. Charts use the same palette as the rest of the app.
- The theme can be changed in the top bar or Settings. Existing saved preferences are respected, new browsers start in light mode, and the root layout initializes the preference before rendering the body. Theme changes remain usable if local storage is blocked.
- Mobile weekly calendars retain readable session cards. The month grid and dashboard week strip scroll within their own containers instead of shrinking text or widening the page.
- Offline screens and PWA icons follow the new palette. The static cache version is bumped so the updated offline assets replace the previous ones.

## Research basis

- [Nielsen Norman Group: visual design principles](https://www.nngroup.com/articles/principles-visual-design/): use scale, hierarchy, contrast and grouping to make the important information easier to locate.
- [Material Design: color roles](https://m3.material.io/styles/color/the-color-system): separate surfaces, foreground content, primary actions and status colors instead of applying an accent everywhere.
- [WCAG 2.2: text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text requires at least 4.5:1 contrast. Browser checks verify the main semantic text/background pairs in both themes.
- [WCAG 2.2: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): sufficient target size or spacing helps avoid accidental activation. Main controls use 44 px targets, above the 24 px minimum criterion.

## Verification scope

Browser stories cover both themes, saved preferences after reload and navigation, synchronization between the top-bar and Settings switches, operation when storage is unavailable, partial commute data, text contrast, and mobile overflow in the dashboard and both calendar views. Screenshots are reviewed at desktop and phone widths. These checks are not a claim of complete WCAG conformance or a guarantee of subjective eye comfort.
