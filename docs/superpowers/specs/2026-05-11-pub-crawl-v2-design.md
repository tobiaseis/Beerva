# Pub Crawl Design v2

Date: 2026-05-11

## Goal

Enhance the visual consistency and map routing of the Pub Crawl feature (Version 2). The goal is to make the published Pub Crawl feed cards match the design language of standard feed posts, and to upgrade the map to show real walking routes between pubs instead of straight lines, while maintaining a free/simple infrastructure.

## UI/UX Consistency (PubCrawlFeedCard)

- **Header:** Update `PubCrawlFeedCard` to match normal `FeedCard` headers. It must include the user's avatar, user name, and the relative time elapsed. Preserve the existing "Pub Crawl" indicator badge/button in the corner of the post.
- **Footer:** Update the action buttons below the carousel to use the exact same Cheers and Comments components and layout as normal feed posts. 
- **Carousel & Stats:** The existing media carousel (Map + Photos) and expandable stats section will be retained.
- **Image Viewing (Global):** Make images in all feed posts (not just pub crawls) pressable so users can view them in a larger (full screen or expanded) modal/view.
- **Record Screen UI:** Move the "Turn into Pub Crawl" button to the top of the `RecordScreen`.

## Map Enhancements & Routing

- **OSRM Integration:** Use the free OSRM (Open Source Routing Machine) API (`router.project-osrm.org/route/v1/walking/`) to fetch walking paths between the pubs in the crawl.
- **Rendering:** Parse the returned route geometry (polyline) and render it on the map instead of drawing straight lines between the pub coordinates.
- **Fallback Mechanism:** The public OSRM API has rate limits and no SLA. If the fetch request fails, times out, or returns an error, the component must gracefully fall back to drawing straight lines between the GPS coordinates.

## Data & State Management

- Route polyline data will be fetched client-side dynamically when the map component mounts or when the crawl data updates.
- To keep the database schema simple, the route geometry will not be stored in Supabase; it remains a client-side enhancement.

## Out of Scope for v2

- Paid routing APIs (Mapbox/Google).
- Storing polyline data in the database.
- Complex route editing or custom waypoints.
