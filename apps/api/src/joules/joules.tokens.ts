/** DI token for the configured Joules API client (I-08). */
export const JOULES_CLIENT = 'JOULES_CLIENT';

/** DI token for the configured Joules status ids the delta sync sweeps (I-09).
 * `GET /clients/ids/{status}` takes the *numeric* Joules status id, and the
 * status catalogue (`OPTIONS /clients/statuses`) exposes names only — so the
 * ids must be configured from the SWA tenant (`JOULES_STATUS_IDS`). */
export const JOULES_STATUS_IDS = 'JOULES_STATUS_IDS';
