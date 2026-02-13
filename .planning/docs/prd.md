# Product Requirements Document (PRD)
# LineUp - Multi-Tenant Project & Client Management Platform

**Document Version:** 1.0  
**Last Updated:** February 5, 2026  
**Document Owner:** Product Management  
**Status:** Ready for Development

---

## Executive Summary

LineUp is a multi-tenant SaaS platform for service-based businesses (agencies, consultancies) to manage client relationships, projects, and deliverables with built-in client transparency.

**Target Market:** Digital agencies, software consultancies, professional services (5-200 employees)

**Key Value Props:**
1. Unified client & project management
2. Configurable client portal (control what clients see)
3. Priority-based workflow (Urgency + Importance matrix)
4. Multi-level hierarchy (Client → Project → Phase → Set → Requirement)

**Business Goals:**
- 50 paying tenants in 6 months
- <5% monthly churn
- 90+ NPS score
- SOC 2 Type 1 certification

---

## Core Entities

### 1. Tenants
- Organization using LineUp
- Fields: name, slug, country, timezone, status, plan_tier
- Isolates all data (RLS)

### 2. Users (Global)
- Can belong to multiple tenants with different roles
- Fields: email, name, password_hash, mfa_enabled, timezone
- Roles: SysAdmin, SysTester, OrgAdmin, OrgUser, ClientUser

### 3. TenantUsers
- Junction: Links users to tenants with role
- One user can be OrgAdmin in one tenant, OrgUser in another

### 4. Clients
- Customer organizations
- Fields: name, status (Onboarding/Active/Inactive/Closed), relationship_manager, industry
- Must belong to tenant

### 5. Contacts
- Individual people (independent entity)
- Can be linked to multiple clients via ClientContacts
- Fields: name, email, phone, title, status

### 6. ClientContacts
- Junction: Links contacts to clients
- One contact can be primary, marked as project contact
- Fields: is_primary, is_project_contact, can_approve_work

### 7. Projects
- Top-level work container
- Must belong to client
- Fields: name, description, dates, urgency, importance, priority (calculated), status (calculated)
- Status logic: Completed → Past_Due → Task_Past_Due → Active → Setup_Stage

### 8. ProjectPhases
- Sequential stages (Discovery, Design, Development, etc.)
- Optional: projects don't need phases
- Fields: name, order_key (calculated), predecessor/successor links, dates
- Order: manual_order > predecessor+1 > successor-1 > 0

### 9. Sets
- Group of requirements
- Can belong to: Client only, Project, or Project+Phase
- Fields: title, urgency, importance, priority, lead, pm, client_contact
- Status calculated from child requirements

### 10. Requirements
- Individual tasks/deliverables
- Must belong to client (optionally project/phase/set)
- Fields: title, type, delivery_type, urgency, importance, priority
- Types: Client_Deliverable, Internal_Deliverable, Technical, Support, Task, Open_Item
- Flags: requires_document, requires_review, make_task

### 11. SupportTickets
- Separate from requirements
- Workflow: Pending_Initial_Review → Pending_Client_Clarification/Pending_Internal_Work → Resolved → Closed
- Auto-close after 7 days resolved

### 12. Documents
- Polymorphic: links to any entity
- Virus scanning required
- Fields: name, file_url, file_type, entity_type, entity_id, show_in_client_portal

### 13. Notes
- Status updates
- Types: Internal_And_External, Internal_Only, External_Only
- Links to any entity

### 14. Discussions
- Threaded comments
- @mentions supported
- Fields: content, is_internal, parent_discussion_id

---

## Priority Calculation Logic

```
Urgency: Critical=4, High=3, Medium=2, Low=1
Importance: High=3, Medium=2, Low=1

Matrix:
              High    Medium   Low
Critical       P1       P2      P3
High           P1       P2      P3  
Medium         P2       P3      P5
Low            P4       P5      P6
```

Implementation as computed column:
```sql
priority INTEGER GENERATED ALWAYS AS (
  CASE urgency
    WHEN 'Critical' THEN CASE importance WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END
    WHEN 'High' THEN CASE importance WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END
    WHEN 'Medium' THEN CASE importance WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 5 END
    WHEN 'Low' THEN CASE importance WHEN 'High' THEN 4 WHEN 'Medium' THEN 5 ELSE 6 END
  END
) STORED;
```

---

## Project Status Calculation

```
IF actual_end_date IS NOT NULL → Completed
ELSE IF any child set past due → Past_Due
ELSE IF any child requirement past due → Task_Past_Due
ELSE IF actual_start_date ≤ today → Active
ELSE IF expected_start_date ≤ today → Active
ELSE IF expected_end_date < today → Past_Due
ELSE → Setup_Stage
```

---

## User Roles & Permissions

**SysAdmin:**
- Full system access
- Create/manage tenants
- System configuration
- All tenant data access

**SysTester:**
- Read/write all tenants (testing)
- Cannot modify system settings
- Cannot delete tenants

**OrgAdmin (per tenant):**
- Full tenant access
- Manage users
- Configure settings
- Manage all entities

**OrgUser (per tenant):**
- View all entities
- Create/edit assigned entities
- Cannot manage users/settings
- Cannot delete projects

**ClientUser (per tenant):**
- View only show_in_client_portal=true
- Read-only (except discussions, support tickets)
- Filtered by visibility level

---

## Portals

### SysAdmin Portal
- Tenant management (create, configure, monitor)
- User management (create, assign roles, reset passwords)
- System settings (email, storage, features)
- Email template administration
- Billing dashboard
- Audit logs

### Organization Portal
Modules:
- Dashboard (my tasks, past due, health, activity)
- Clients (list, detail, contacts)
- Projects (list, detail, phases, sets, requirements)
- Sets (Eisenhower matrix view, table view)
- Requirements (Kanban board, table view)
- Support Tickets
- Documents
- Reports
- Settings (OrgAdmin only: tenant config, team, catalogs, billing)

### Client Portal
- Overview dashboard
- Projects (filtered by show_in_client_portal)
- Documents (accessible only)
- Support Tickets (create, view, comment)
- Discussions (external only, can reply)
- Configurable visibility: Project/Phase/Set/Requirement level

---

## Notifications

**Email Notifications:**
1. Welcome user
2. Password recovery
3. New task assignment
4. Task due soon (24 hours)
5. Task past due
6. @Mention in discussion
7. Discussion reply
8. Review request
9. Support ticket created/updated
10. Daily digest (opt-in)

**In-App Notifications:**
- Bell icon with unread count
- Last 20 notifications in dropdown
- Click to navigate to entity
- Mark read individually or all

**Preferences:**
- Per notification type: Email Yes/No, In-app Yes/No
- Frequency: Real-time, Daily digest, Weekly digest
- Daily digest sends 8 AM user timezone

---

## Security

**Authentication:**
- bcrypt password hashing (cost 12)
- JWT tokens (1 hour expiry, 30 day refresh)
- MFA via TOTP (required for SysAdmin/OrgAdmin)
- Account lockout after 5 failed attempts (15 min)

**Authorization:**
- Row-Level Security (RLS) at database
- Every query filtered by tenant_id
- Role-based permissions enforced

**Data Security:**
- TLS 1.3 in transit
- Database encryption at rest
- File encryption (S3 SSE-KMS)
- Virus scanning on uploads (ClamAV)

**Audit:**
- All authentication events logged
- All data changes logged
- Field-level change tracking
- IP address, user agent captured
- 90 days online, 7 years archived

---

## Phase 2 Features

1. **Templates:** Save projects/phases/sets as reusable templates
2. **Custom Forms:** Build forms to send to clients (discovery questionnaires)
3. **DocuSign Integration:** E-signature for contracts/agreements
4. **Tenant Invoicing:** SysAdmin bills tenants (Stripe)
5. **Client Invoicing:** Tenants bill their clients
6. **Field Dictionary UI:** Hover tooltips on every field with definitions

---

## Technical Requirements

**Performance:**
- Page load: <3s (95th percentile)
- API response: <500ms (95th percentile)
- Support 1,000 concurrent users per tenant
- Support 10,000 tenants total

**Availability:**
- 99.5% uptime SLA
- Backups every 6 hours
- Point-in-time recovery (7 days)
- RTO: 4 hours, RPO: 6 hours

**Browser Support:**
- Chrome 100+
- Firefox 100+
- Safari 15+
- Edge 100+

**Stack (Recommended):**
- Frontend: React + TypeScript + Next.js + Tailwind
- Backend: Node.js + Express + Prisma
- Database: PostgreSQL 15+ with RLS
- Storage: S3/R2
- Cache: Redis

---

## Success Metrics

**Activation:**
- Time to first project: <15 min
- % creating ≥1 project in 7 days: >80%

**Engagement:**
- DAU/MAU: >40%
- Requirements completed/user/week: >10

**Retention:**
- 30-day retention: >75%
- 90-day retention: >60%
- Monthly churn: <5%

**Business:**
- MRR growth: Track monthly
- ARPA: $200/month target
- LTV: $7,200 (3 years)
- CAC: <$600
- LTV:CAC: >3:1

---

## Launch Checklist

**Functional:**
- [ ] All P0 features complete
- [ ] 5 personas can complete workflows
- [ ] SysAdmin can create tenants
- [ ] Client portal functional

**Security:**
- [ ] Penetration test passed
- [ ] RLS verified
- [ ] File upload security tested
- [ ] HTTPS enforced

**Operational:**
- [ ] Monitoring configured
- [ ] Backups tested
- [ ] Incident response documented
- [ ] Support system ready

**Business:**
- [ ] Pricing finalized
- [ ] Billing tested
- [ ] Legal docs reviewed
- [ ] Marketing site launched

---

**END OF PRD**

*For complete entity specifications, see database-schema.md*
