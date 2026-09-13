# Residual-risk register and pilot disposition

| Risk | Control / acceptance condition | Owner | Status |
| --- | --- | --- | --- |
| Host administrator can read or alter governed data | Dedicated account, encrypted volume, host monitoring, independent restore | Operations/security | Deployment acceptance pending |
| Backup confidentiality and key loss | Separate least-privilege role/key, encrypted offsite copies, rotation restore test | Operations/security | Deployment acceptance pending |
| Authorized manager misuse | Human principal attribution, audit review, separation of approval policy | Requirements/audit | Pilot validation pending |
| Single-process/single-repository architecture | Bounded queue, explicit capacity envelope, restore/cutover runbook | Engineering | Accepted for v1 scope |
| Canonical JSON heap and pause growth | 4 MB/750 MB/5 s review triggers; quarterly forecast | Engineering | Accepted with thresholds |
| Transport penetration and TLS configuration | Independent deployment review and adapter penetration test | Security | Go-live blocker |
| Real filesystem disk-full and `SIGKILL` behavior | Quarterly fault drill on deployment filesystem | Operations | Go-live drill pending |
| Human workflow usability/accessibility | Two-week pilot with all roles and disposition log | Product | Go-live pilot pending |

Pilot sign-off fields: repository, deployment, data classification, start/end,
requirements lead, test lead, engineering lead, security lead, operations lead,
audit lead, accepted risks, evidence links, and dated signatures. Until those
fields are completed in the deployment change record, v1.0.0 is a production
release candidate and the rollout status is **no-go**.
