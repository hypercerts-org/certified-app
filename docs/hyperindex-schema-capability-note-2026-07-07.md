# Hyperindex production schema capability note

- Endpoint: `https://api.indexer.hypercerts.dev/graphql`
- Introspected at: `2026-07-07T14:51:45Z`
- Purpose: Stage 0 baseline for the Certified Magic Indexer → Hyperindex migration.

## Relevant query roots

| Root field | Status | Arguments |
| --- | --- | --- |
| `orgHypercertsClaimActivity` | present | `after: String`, `last: Int`, `before: String`, `sortBy: OrgHypercertsClaimActivitySortField`, `sortDirection: SortDirection`, `where: OrgHypercertsClaimActivityWhereInput`, `first: Int` |
| `orgHypercertsClaimActivityByUri` | present | `uri: String!` |
| `orgHypercertsCollection` | present | `where: OrgHypercertsCollectionWhereInput`, `first: Int`, `after: String`, `last: Int`, `before: String`, `sortBy: OrgHypercertsCollectionSortField`, `sortDirection: SortDirection` |
| `orgHypercertsCollectionByUri` | present | `uri: String!` |
| `appCertifiedGraphFollow` | present | `sortBy: AppCertifiedGraphFollowSortField`, `sortDirection: SortDirection`, `where: AppCertifiedGraphFollowWhereInput`, `first: Int`, `after: String`, `last: Int`, `before: String` |
| `appCertifiedGraphFollowByUri` | present | `uri: String!` |
| `appCertifiedActorProfile` | present | `sortBy: AppCertifiedActorProfileSortField`, `sortDirection: SortDirection`, `where: AppCertifiedActorProfileWhereInput`, `first: Int`, `after: String`, `last: Int`, `before: String` |
| `appCertifiedActorProfileByUri` | present | `uri: String!` |
| `appCertifiedActorOrganization` | present | `first: Int`, `after: String`, `last: Int`, `before: String`, `sortBy: AppCertifiedActorOrganizationSortField`, `sortDirection: SortDirection`, `where: AppCertifiedActorOrganizationWhereInput` |
| `appCertifiedActorOrganizationByUri` | present | `uri: String!` |
| `appCertifiedBadgeAward` | present | `sortBy: AppCertifiedBadgeAwardSortField`, `sortDirection: SortDirection`, `where: AppCertifiedBadgeAwardWhereInput`, `first: Int`, `after: String`, `last: Int`, `before: String` |
| `appCertifiedBadgeAwardByUri` | present | `uri: String!` |
| `appCertifiedBadgeDefinition` | present | `after: String`, `last: Int`, `before: String`, `sortBy: AppCertifiedBadgeDefinitionSortField`, `sortDirection: SortDirection`, `where: AppCertifiedBadgeDefinitionWhereInput`, `first: Int` |
| `appCertifiedBadgeDefinitionByUri` | present | `uri: String!` |
| `appCertifiedBadgeResponse` | present | `first: Int`, `after: String`, `last: Int`, `before: String`, `sortBy: AppCertifiedBadgeResponseSortField`, `sortDirection: SortDirection`, `where: AppCertifiedBadgeResponseWhereInput` |
| `appCertifiedBadgeResponseByUri` | present | `uri: String!` |
| `orgHypercertsFundingReceipt` | present | `last: Int`, `before: String`, `sortBy: OrgHypercertsFundingReceiptSortField`, `sortDirection: SortDirection`, `where: OrgHypercertsFundingReceiptWhereInput`, `first: Int`, `after: String` |
| `orgHypercertsFundingReceiptByUri` | present | `uri: String!` |
| `endorsementClosure` | present | `first: Int`, `after: String`, `where: EndorsementClosureWhereInput!` |
| `recordTimeline` | present | `where: RecordTimelineWhereInput!`, `first: Int`, `after: String` |
| `externalLabels` | present | `sources: [String!]`, `values: [String!]`, `activeOnly: Boolean`, `subjects: [!]!` |
| `search` | present | `collection: String`, `first: Int`, `after: String`, `query: String!` |
| `followerEvents` | missing | — |
| `hydrateFeedPage` | missing | — |
| `HydrateFeedPage` | missing | — |

## Where/input capabilities

### `AppCertifiedActorOrganizationWhereInput`

`organizationType: AppCertifiedActorOrganizationOrganizationTypeArrayFilterInput`, `location: AppCertifiedActorOrganizationLocationObjectFilterInput`, `authorLabels: ExternalLabelWhereInput`, `urls: AppCertifiedActorOrganizationUrlsArrayFilterInput`, `did: DIDFilterInput`, `externalLabels: ExternalLabelWhereInput`, `foundedDate: DateTimeFilterInput`, `createdAt: DateTimeFilterInput`, `visibility: StringFilterInput`, `longDescription: AppCertifiedActorOrganizationLongDescriptionUnionFilterInput`, `uri: URIFilterInput`

### `AppCertifiedActorProfileWhereInput`

`externalLabels: ExternalLabelWhereInput`, `authorLabels: ExternalLabelWhereInput`, `avatar: AppCertifiedActorProfileAvatarUnionFilterInput`, `banner: AppCertifiedActorProfileBannerUnionFilterInput`, `website: StringFilterInput`, `createdAt: DateTimeFilterInput`, `did: DIDFilterInput`, `description: StringFilterInput`, `displayName: StringFilterInput`, `pronouns: StringFilterInput`, `uri: URIFilterInput`

### `AppCertifiedBadgeAwardWhereInput`

`createdAt: DateTimeFilterInput`, `badge: AppCertifiedBadgeAwardBadgeObjectFilterInput`, `externalLabels: ExternalLabelWhereInput`, `note: StringFilterInput`, `url: StringFilterInput`, `subject: AppCertifiedBadgeAwardSubjectUnionFilterInput`, `badgeType: StringFilterInput`, `uri: URIFilterInput`, `did: DIDFilterInput`, `authorLabels: ExternalLabelWhereInput`

### `AppCertifiedBadgeDefinitionWhereInput`

`uri: URIFilterInput`, `externalLabels: ExternalLabelWhereInput`, `authorLabels: ExternalLabelWhereInput`, `allowedIssuers: AppCertifiedBadgeDefinitionAllowedIssuersArrayFilterInput`, `createdAt: DateTimeFilterInput`, `icon: PresenceFilterInput`, `description: StringFilterInput`, `did: DIDFilterInput`, `title: StringFilterInput`, `badgeType: StringFilterInput`

### `AppCertifiedBadgeResponseWhereInput`

`did: DIDFilterInput`, `externalLabels: ExternalLabelWhereInput`, `authorLabels: ExternalLabelWhereInput`, `weight: StringFilterInput`, `response: StringFilterInput`, `createdAt: DateTimeFilterInput`, `badgeAward: AppCertifiedBadgeResponseBadgeAwardObjectFilterInput`, `uri: URIFilterInput`

### `AppCertifiedGraphFollowWhereInput`

`authorLabels: ExternalLabelWhereInput`, `via: AppCertifiedGraphFollowViaObjectFilterInput`, `subject: StringFilterInput`, `createdAt: DateTimeFilterInput`, `uri: URIFilterInput`, `did: DIDFilterInput`, `externalLabels: ExternalLabelWhereInput`

### `EndorsementClosureWhereInput`

`did: EndorsementClosureDIDFilterInput!`, `degree: EndorsementClosureDegreeFilterInput`

### `OrgHypercertsClaimActivityWhereInput`

`externalLabels: ExternalLabelWhereInput`, `image: OrgHypercertsClaimActivityImageUnionFilterInput`, `workScope: OrgHypercertsClaimActivityWorkScopeUnionFilterInput`, `shortDescriptionFacets: OrgHypercertsClaimActivityShortDescriptionFacetsArrayFilterInput`, `title: StringFilterInput`, `contributors: OrgHypercertsClaimActivityContributorsArrayFilterInput`, `endDate: DateTimeFilterInput`, `startDate: DateTimeFilterInput`, `contributorDid: DIDFilterInput`, `authorLabels: ExternalLabelWhereInput`, `did: DIDFilterInput`, `shortDescription: StringFilterInput`, `rights: OrgHypercertsClaimActivityRightsObjectFilterInput`, `locations: OrgHypercertsClaimActivityLocationsArrayFilterInput`, `uri: URIFilterInput`, `createdAt: DateTimeFilterInput`, `description: OrgHypercertsClaimActivityDescriptionUnionFilterInput`

### `OrgHypercertsCollectionWhereInput`

`banner: OrgHypercertsCollectionBannerUnionFilterInput`, `items: OrgHypercertsCollectionItemsArrayFilterInput`, `description: OrgHypercertsCollectionDescriptionUnionFilterInput`, `shortDescriptionFacets: OrgHypercertsCollectionShortDescriptionFacetsArrayFilterInput`, `avatar: OrgHypercertsCollectionAvatarUnionFilterInput`, `shortDescription: StringFilterInput`, `title: StringFilterInput`, `externalLabels: ExternalLabelWhereInput`, `type: StringFilterInput`, `did: DIDFilterInput`, `createdAt: DateTimeFilterInput`, `location: OrgHypercertsCollectionLocationObjectFilterInput`, `uri: URIFilterInput`, `authorLabels: ExternalLabelWhereInput`

### `OrgHypercertsFundingReceiptWhereInput`

`uri: URIFilterInput`, `did: DIDFilterInput`, `authorLabels: ExternalLabelWhereInput`, `transactionId: StringFilterInput`, `occurredAt: DateTimeFilterInput`, `to: OrgHypercertsFundingReceiptToUnionFilterInput`, `paymentNetwork: StringFilterInput`, `amount: StringFilterInput`, `externalLabels: ExternalLabelWhereInput`, `from: OrgHypercertsFundingReceiptFromUnionFilterInput`, `for: OrgHypercertsFundingReceiptForObjectFilterInput`, `notes: StringFilterInput`, `createdAt: DateTimeFilterInput`, `paymentRail: StringFilterInput`, `currency: StringFilterInput`

### `RecordTimelineWhereInput`

`collection: RecordTimelineCollectionFilterInput!`, `did: DIDFilterInput`

## Key output fields

### `OrgHypercertsClaimActivity`

`certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `contributors: [!]`, `createdAt: DateTime!`, `description: OrgHypercertsClaimActivityDescriptionUnion`, `did: String!`, `endDate: DateTime`, `externalLabels: []!`, `image: OrgHypercertsClaimActivityImageUnion`, `locations: [!]`, `rights: ComAtprotoRepoStrongRef`, `rkey: String!`, `shortDescription: String!`, `shortDescriptionFacets: [!]`, `startDate: DateTime`, `title: String!`, `uri: String!`, `workScope: OrgHypercertsClaimActivityWorkScopeUnion`

### `OrgHypercertsCollection`

`avatar: OrgHypercertsCollectionAvatarUnion`, `banner: OrgHypercertsCollectionBannerUnion`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `description: OrgHypercertsCollectionDescriptionUnion`, `did: String!`, `externalLabels: []!`, `items: [!]`, `location: ComAtprotoRepoStrongRef`, `rkey: String!`, `shortDescription: String`, `shortDescriptionFacets: [!]`, `title: String!`, `type: String`, `uri: String!`

### `AppCertifiedGraphFollow`

`certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `did: String!`, `externalLabels: []!`, `rkey: String!`, `subject: String!`, `uri: String!`, `via: ComAtprotoRepoStrongRef`

### `AppCertifiedActorProfile`

`avatar: AppCertifiedActorProfileAvatarUnion`, `banner: AppCertifiedActorProfileBannerUnion`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `description: String`, `did: String!`, `displayName: String`, `externalLabels: []!`, `pronouns: String`, `rkey: String!`, `uri: String!`, `website: String`

### `AppCertifiedActorOrganization`

`certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `did: String!`, `externalLabels: []!`, `foundedDate: DateTime`, `location: ComAtprotoRepoStrongRef`, `longDescription: AppCertifiedActorOrganizationLongDescriptionUnion`, `organizationType: [!]`, `rkey: String!`, `uri: String!`, `urls: [!]`, `visibility: String`

### `AppCertifiedBadgeAward`

`badge: ComAtprotoRepoStrongRef!`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `did: String!`, `externalLabels: []!`, `note: String`, `rkey: String!`, `subject: AppCertifiedBadgeAwardSubjectUnion!`, `uri: String!`, `url: String`

### `AppCertifiedBadgeDefinition`

`allowedIssuers: [!]`, `badgeType: String!`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `description: String`, `did: String!`, `externalLabels: []!`, `icon: Blob`, `rkey: String!`, `title: String!`, `uri: String!`

### `AppCertifiedBadgeResponse`

`badgeAward: ComAtprotoRepoStrongRef!`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `did: String!`, `externalLabels: []!`, `response: String!`, `rkey: String!`, `uri: String!`, `weight: String`

### `OrgHypercertsFundingReceipt`

`amount: String!`, `certifiedProfileData: AppCertifiedActorProfile`, `cid: String!`, `createdAt: DateTime!`, `currency: String!`, `did: String!`, `externalLabels: []!`, `for: ComAtprotoRepoStrongRef`, `from: OrgHypercertsFundingReceiptFromUnion`, `notes: String`, `occurredAt: DateTime`, `paymentNetwork: String`, `paymentRail: String`, `rkey: String!`, `to: OrgHypercertsFundingReceiptToUnion!`, `transactionId: String`, `uri: String!`

## Stage 1 smoke counts

```json
{
  "activities": {
    "pageInfo": {
      "endCursor": "WyIyMDI2LTA3LTA3VDE0OjExOjQ5LjIyMzA2OVoiLCJhdDovL2RpZDpwbGM6azR1YWZqM2tsZTV5d3Y2amRnb3loaHV4L29yZy5oeXBlcmNlcnRzLmNsYWltLmFjdGl2aXR5LzNtb2w2eGl4ZmFjMmkiXQ==",
      "hasNextPage": true
    },
    "totalCount": 1142
  },
  "awards": {
    "pageInfo": {
      "endCursor": "WyIyMDI2LTA3LTA3VDEyOjI3OjA5LjA1MTMzMloiLCJhdDovL2RpZDpwbGM6eWpjazJzeWJrc3lpZ3AzenZicTdiZmtpL2FwcC5jZXJ0aWZpZWQuYmFkZ2UuYXdhcmQvM21xMmx6MzZiNWsyaSJd",
      "hasNextPage": true
    },
    "totalCount": 2022
  },
  "orgs": {
    "pageInfo": {
      "endCursor": "WyIyMDI2LTA3LTA3VDAxOjUwOjAxLjc3Njk4NloiLCJhdDovL2RpZDpwbGM6YnoyZ2tqM2toYXpmdWN0b3N0YjVrcGp2L2FwcC5jZXJ0aWZpZWQuYWN0b3Iub3JnYW5pemF0aW9uL3NlbGYiXQ==",
      "hasNextPage": true
    },
    "totalCount": 1150
  },
  "profiles": {
    "pageInfo": {
      "endCursor": "WyIyMDI2LTA3LTA3VDE0OjQzOjQ2LjcyOTYzMloiLCJhdDovL2RpZDpwbGM6dWNmbGZpd3ZpZDNjdGM1YXZqNnF3ZWhlL2FwcC5jZXJ0aWZpZWQuYWN0b3IucHJvZmlsZS9zZWxmIl0=",
      "hasNextPage": true
    },
    "totalCount": 3401
  },
  "projects": {
    "pageInfo": {
      "endCursor": "WyIyMDI2LTA3LTA3VDE0OjMxOjAzLjMwMzM2MVoiLCJhdDovL2RpZDpwbGM6d2U1a29laXBsdnp4cTJqbmIzb3M1YXd4L29yZy5oeXBlcmNlcnRzLmNvbGxlY3Rpb24vM21uNmhoaGRjY2MycSJd",
      "hasNextPage": true
    },
    "totalCount": 987
  }
}
```

## Migration notes from this introspection

- Typed roots for counts, activities, projects, follows, actors/orgs, badges, and funding are present.
- `recordTimeline` is present and accepts `where`, `first`, and `after`.
- `endorsementClosure` is present and accepts `where`, `first`, and `after`.
- Magic-specific `followerEvents` and `HydrateFeedPage` roots are not present on production Hyperindex.
- `AppCertifiedBadgeAward` exposes `certifiedProfileData`, but not the Magic inline `issuer` or `response` fields; response data is available via `appCertifiedBadgeResponse`.
- `OrgHypercertsClaimActivityWhereInput` includes `contributorDid`, so the contributed-activities bucket can use a typed Hyperindex filter.
- `OrgHypercertsCollectionWhereInput` includes `items`, so projects-containing-activity can use collection item filtering after confirming the exact nested shape in the operation implementation.
