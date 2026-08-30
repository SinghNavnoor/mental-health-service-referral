export type ReferralPayload = {
  programId: string;
  /** HubSpot pipeline / program label (e.g. Family Housing 6, Regional RRH) */
  programName: string;
  /**
   * Full client name from HubSpot `hoh__program__first_name`
   * (HOH - Full Name - Hidden Property Only for Automation purpose)
   */
  clientName: string;
  /**
   * HubSpot `program_start_date` — used to pick the closest PandaDoc
   * document when multiple packets share the same client name.
   * Not expected to equal the create-date in the PandaDoc title.
   */
  programStartDate: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  /** Age (HOH) — `a_hoh` */
  age?: string;
  /** Email Copy (MHS) — `e_copy` */
  clientEmail?: string;
  /** Phone Copy (MHS) — `p_mhs` */
  clientPhone?: string;
  /** Referral Type (MHS) — `r_t_mhs` */
  referralType?: string;
  /** Shelter Move-in Date (MHS) — `s_m_date` */
  moveInDate?: string;
  /** Estimated Program Exit Date — `epes_er` */
  anticipatedExitDate?: string;
  /** Total Household Size — `tt_sz` */
  familyHousingSize?: string;
  /** Client Preferred Communication (MHS) — `p_c_mhs` */
  preferredCommunication?: string;
  /** Client Initial Assessment Areas (MHS) — `i_aa_mhs` */
  initialAssessmentAreas?: string;
  /** Client Preferred Services (MHS) — `cps_mhs` */
  preferredServices?: string;
  /** Program owner — `hubspot_owner_id` (numeric id for now) */
  hubspotOwnerId?: string;
  extraFields?: Record<string, string>;
};

export type RoiExtractionResult = {
  englishPdf: Uint8Array;
  spanishPdf: Uint8Array;
  englishPageIndexes: number[];
  spanishPageIndexes: number[];
};

export type PandaDocListItem = {
  id: string;
  name: string;
  status: string;
  date_created?: string;
  date_completed?: string;
};
