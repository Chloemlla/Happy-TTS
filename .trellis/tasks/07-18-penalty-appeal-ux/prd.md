# Penalty Appeal UX

## Goal
On every user-facing **penalty/restriction** surface, show clear appeal options:
1. Email `support@chloemlla.com`
2. Submit a support ticket via an in-page ticket modal

## Surfaces in scope
- IP ban gate (`FirstVisitVerification` banned state)
- Smart human-check abuse ban (`SmartHumanCheck` ABUSE_BANNED)
- Ticket moderation punishment / ticket permission ban (`TicketSystem` 403 paths)
- Account suspended status on profile (`UserProfile`)

## Requirements
1. Shared reusable appeal UI component (not copy-pasted cards).
2. Shared ticket appeal modal that:
   - Prefills title/description from penalty context
   - Submits via existing `ticketApi.createTicket` when authenticated
   - If unauthenticated, still shows modal with login guidance + email fallback
3. Appeal email is always `support@chloemlla.com`.
4. Keep existing penalty messaging; append appeal paths rather than replace reason text.
5. Match current studio-style UI patterns.

## Acceptance Criteria
- [x] All listed penalty surfaces expose email + ticket modal entry
- [x] Authenticated users can submit an appeal ticket from the modal
- [x] Unauthenticated ban screens still expose email and login/ticket path
- [ ] Commit + push

## Notes
- When ticket permission is banned, createTicket may still 403; UI prioritizes email and shows explicit fallback.
