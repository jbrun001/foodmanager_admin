### Scraper Behavior by Environment

| Environment                            | Pack size in pagetitle                                        | Requires cookie click to examine page   |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| Local Not Headless<BR>not in container | Pass                                                          | Pass                                    |
| Local Headless<BR>not in container     | Pass                                                          | Pass                                    |
| Local Headless<BR>in container         | Pass                                                          | Pass                                    |
| Google Cloud Headless<BR>in container  | Fail<BR> initially worked then detached frame error (blocked) | Fail<BR> detached frame error (blocked) |

Evaluation.
Code is correct and operates across environments.  
Google Cloud Run IPs are likely flagged by Tesco's anti-bot system (Akamai), especially after cookie acceptance.  
The site uses JavaScript-based redirection to display a block message after being flagged.
