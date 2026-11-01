// ISO 18245 merchant category codes (MCC): the four-digit code a card acquirer gives each merchant (DE 18 of an
// ISO 8583 message). ISO 18245 fixes the format and the ranges; the full list of codes is maintained by the card
// schemes and changes over time. This file holds the ranges plus the codes seen most often, so an MCC outside the
// bundled list is "unlisted here", not "invalid".

/** [from, to, group] — the groups ISO 18245 / the schemes assign blocks of numbers to. */
export const MCC_RANGES: ReadonlyArray<readonly [number, number, string]> = [
	[1, 1499, 'Agricultural services'],
	[1500, 2999, 'Contracted services'],
	[3000, 3299, 'Airlines and air carriers'],
	[3300, 3499, 'Car rental'],
	[3500, 3999, 'Lodging'],
	[4000, 4799, 'Transportation services'],
	[4800, 4999, 'Utilities and communication services'],
	[5000, 5599, 'Retail outlets'],
	[5600, 5699, 'Clothing stores'],
	[5700, 7299, 'Miscellaneous stores and personal services'],
	[7300, 7999, 'Business services, repair and entertainment'],
	[8000, 8999, 'Professional services and membership organizations'],
	[9000, 9999, 'Government services'],
];

export function mccGroup(code: number): string | null {
	return MCC_RANGES.find(([a, b]) => code >= a && code <= b)?.[2] ?? null;
}

const RAW = `
0742|Veterinary services
0763|Agricultural cooperatives
0780|Landscaping and horticultural services
1520|General contractors, residential and commercial
1711|Heating, plumbing and air conditioning contractors
1731|Electrical contractors
1740|Masonry, stonework, tile setting and plastering contractors
1750|Carpentry contractors
1761|Roofing, siding and sheet metal contractors
1771|Concrete work contractors
1799|Special trade contractors
2741|Miscellaneous publishing and printing
2791|Typesetting, platemaking and related services
2842|Specialty cleaning, polishing and sanitation preparations
4011|Railroads
4111|Local and suburban commuter transport, including ferries
4112|Passenger railways
4119|Ambulance services
4121|Taxicabs and limousines
4131|Bus lines
4214|Motor freight carriers and trucking
4215|Courier services
4225|Public warehousing and storage
4411|Steamship and cruise lines
4457|Boat rentals and leases
4511|Airlines and air carriers
4582|Airports, flying fields and airport terminals
4722|Travel agencies and tour operators
4784|Tolls and bridge fees
4789|Transportation services, not elsewhere classified
4812|Telecommunication equipment and telephone sales
4814|Telecommunication services
4815|Monthly summary telephone charges
4816|Computer network and information services
4821|Telegraph services
4899|Cable, satellite and other pay television and radio services
4900|Utilities: electric, gas, water and sanitary
5013|Motor vehicle supplies and new parts
5021|Office and commercial furniture
5039|Construction materials, not elsewhere classified
5044|Photographic, photocopy and microfilm equipment
5045|Computers, computer peripheral equipment and software
5047|Dental, laboratory, medical and ophthalmic equipment
5051|Metal service centers and offices
5065|Electrical parts and equipment
5072|Hardware equipment and supplies
5094|Precious stones, metals, watches and jewelry
5111|Stationery, office supplies and printing paper
5122|Drugs, drug proprietaries and druggist sundries
5131|Piece goods, notions and other dry goods
5169|Chemicals and allied products
5172|Petroleum and petroleum products
5192|Books, periodicals and newspapers
5193|Florists' supplies, nursery stock and flowers
5198|Paints, varnishes and supplies
5199|Nondurable goods, not elsewhere classified
5200|Home supply warehouse stores
5211|Lumber and building materials stores
5231|Glass, paint and wallpaper stores
5251|Hardware stores
5261|Nurseries, lawn and garden supply stores
5271|Mobile home dealers
5300|Wholesale clubs
5309|Duty free stores
5310|Discount stores
5311|Department stores
5331|Variety stores
5399|Miscellaneous general merchandise
5411|Grocery stores and supermarkets
5422|Freezer and locker meat provisioners
5441|Candy, nut and confectionery stores
5451|Dairy products stores
5462|Bakeries
5499|Miscellaneous food stores, convenience stores and specialty markets
5511|Car and truck dealers (new and used), sales, service, repairs
5521|Car and truck dealers (used only)
5531|Auto and home supply stores
5532|Automotive tire stores
5533|Automotive parts and accessories stores
5541|Service stations (with or without ancillary services)
5542|Automated fuel dispensers
5551|Boat dealers
5561|Camper, recreational and utility trailer dealers
5571|Motorcycle shops and dealers
5599|Miscellaneous automotive, aircraft and farm equipment dealers
5611|Men's and boys' clothing and accessories stores
5621|Women's ready-to-wear stores
5631|Women's accessory and specialty shops
5641|Children's and infants' wear stores
5651|Family clothing stores
5655|Sports and riding apparel stores
5661|Shoe stores
5681|Furriers and fur shops
5691|Men's and women's clothing stores
5697|Tailors, seamstresses, mending and alterations
5698|Wig and toupee stores
5699|Miscellaneous apparel and accessory shops
5712|Furniture, home furnishings and equipment stores
5713|Floor covering stores
5714|Drapery, window covering and upholstery stores
5718|Fireplace, fireplace screens and accessories stores
5719|Miscellaneous home furnishing specialty stores
5722|Household appliance stores
5732|Electronics stores
5733|Music stores: musical instruments, pianos and sheet music
5734|Computer software stores
5735|Record stores
5811|Caterers
5812|Eating places and restaurants
5813|Drinking places (alcoholic beverages): bars, taverns, nightclubs
5814|Fast food restaurants
5815|Digital goods: media (books, movies, music)
5816|Digital goods: games
5817|Digital goods: applications (excludes games)
5818|Digital goods: large digital goods merchant
5912|Drug stores and pharmacies
5921|Package stores: beer, wine and liquor
5931|Used merchandise and secondhand stores
5932|Antique shops
5933|Pawn shops
5935|Wrecking and salvage yards
5937|Antique reproductions
5940|Bicycle shops: sales and service
5941|Sporting goods stores
5942|Book stores
5943|Stationery stores, office and school supply stores
5944|Jewelry stores, watches, clocks and silverware stores
5945|Hobby, toy and game shops
5946|Camera and photographic supply stores
5947|Gift, card, novelty and souvenir shops
5948|Luggage and leather goods stores
5949|Sewing, needlework, fabric and piece goods stores
5950|Glassware and crystal stores
5960|Direct marketing: insurance services
5961|Mail order houses, including catalog order stores
5962|Direct marketing: travel-related arrangement services
5963|Door-to-door sales
5964|Direct marketing: catalog merchants
5965|Direct marketing: combination catalog and retail merchants
5966|Direct marketing: outbound telemarketing merchants
5967|Direct marketing: inbound telemarketing merchants
5968|Direct marketing: continuity/subscription merchants
5969|Direct marketing: other direct marketers
5970|Artist's supply and craft shops
5971|Art dealers and galleries
5972|Stamp and coin stores
5973|Religious goods stores
5975|Hearing aids: sales, service and supply stores
5976|Orthopedic goods: prosthetic devices
5977|Cosmetic stores
5978|Typewriter stores: sales, rentals and service
5983|Fuel dealers: fuel oil, wood, coal and liquefied petroleum
5992|Florists
5993|Cigar stores and stands
5994|News dealers and newsstands
5995|Pet shops, pet foods and supplies
5996|Swimming pools: sales, service and supplies
5997|Electric razor stores: sales and service
5998|Tent and awning shops
5999|Miscellaneous and specialty retail shops
6010|Financial institutions: manual cash disbursements
6011|Financial institutions: automated cash disbursements (ATM)
6012|Financial institutions: merchandise and services
6051|Non-financial institutions: foreign currency, money orders, travelers cheques
6211|Security brokers and dealers
6300|Insurance sales, underwriting and premiums
6381|Insurance premiums
6399|Insurance, not elsewhere classified
6513|Real estate agents and managers: rentals
7011|Lodging: hotels, motels and resorts
7012|Timeshares
7032|Sporting and recreational camps
7033|Trailer parks and campgrounds
7210|Laundry, cleaning and garment services
7211|Laundries: family and commercial
7216|Dry cleaners
7217|Carpet and upholstery cleaning
7221|Photographic studios
7230|Beauty and barber shops
7251|Shoe repair shops, shoe shine parlors and hat cleaning shops
7261|Funeral service and crematories
7273|Dating and escort services
7276|Tax preparation services
7277|Counseling services: debt, marriage, personal
7278|Buying and shopping services and clubs
7296|Clothing rental: costumes, uniforms, formal wear
7297|Massage parlors
7298|Health and beauty spas
7299|Miscellaneous personal services
7311|Advertising services
7321|Consumer credit reporting agencies
7333|Commercial photography, art and graphics
7338|Quick copy, reproduction and blueprinting services
7339|Stenographic and secretarial support services
7342|Exterminating and disinfecting services
7349|Cleaning and maintenance, janitorial services
7361|Employment agencies and temporary help services
7372|Computer programming, data processing and integrated systems design
7375|Information retrieval services
7379|Computer maintenance and repair services
7392|Management, consulting and public relations services
7393|Detective agencies, protective agencies and security services
7394|Equipment rental and leasing services
7395|Photofinishing laboratories and photo developing
7399|Business services, not elsewhere classified
7511|Truck stop
7512|Car rental agencies
7513|Truck and utility trailer rentals
7519|Motor home and recreational vehicle rentals
7523|Parking lots and garages
7531|Automotive body repair shops
7534|Tire retreading and repair shops
7535|Automotive paint shops
7538|Automotive service shops (non-dealer)
7542|Car washes
7549|Towing services
7622|Electronics repair shops
7623|Air conditioning and refrigeration repair shops
7629|Electrical and small appliance repair shops
7631|Watch, clock and jewelry repair shops
7641|Furniture: reupholstery, repair and refinishing
7692|Welding repair
7699|Miscellaneous repair shops and related services
7800|Government-owned lotteries
7801|Government-licensed online casinos (internet gambling)
7802|Government-licensed horse and dog racing
7829|Motion picture and video tape production and distribution
7832|Motion picture theaters
7841|Video tape rental stores
7911|Dance halls, studios and schools
7922|Theatrical producers (except motion pictures) and ticket agencies
7929|Bands, orchestras and miscellaneous entertainers
7932|Billiard and pool establishments
7933|Bowling alleys
7941|Commercial sports, athletic fields and professional sport clubs
7991|Tourist attractions and exhibits
7992|Public golf courses
7993|Video amusement game supplies
7994|Video game arcades and establishments
7995|Betting, including lottery tickets, casino gaming chips and off-track betting
7996|Amusement parks, carnivals and circuses
7997|Membership clubs (sports, recreation, athletic) and country clubs
7998|Aquariums, seaquariums and dolphinariums
7999|Recreation services, not elsewhere classified
8011|Doctors and physicians, not elsewhere classified
8021|Dentists and orthodontists
8031|Osteopaths
8041|Chiropractors
8042|Optometrists and ophthalmologists
8043|Opticians, optical goods and eyeglasses
8049|Podiatrists and chiropodists
8050|Nursing and personal care facilities
8062|Hospitals
8071|Medical and dental laboratories
8099|Medical services and health practitioners, not elsewhere classified
8111|Legal services and attorneys
8211|Elementary and secondary schools
8220|Colleges, universities, professional schools and junior colleges
8241|Correspondence schools
8244|Business and secretarial schools
8249|Vocational and trade schools
8299|Schools and educational services, not elsewhere classified
8351|Child care services
8398|Charitable and social service organizations
8641|Civic, fraternal and social associations
8651|Political organizations
8661|Religious organizations
8675|Automobile associations
8699|Membership organizations, not elsewhere classified
8734|Testing laboratories (non-medical)
8911|Architectural, engineering and surveying services
8931|Accounting, auditing and bookkeeping services
8999|Professional services, not elsewhere classified
9211|Court costs, including alimony and child support
9222|Fines
9223|Bail and bond payments
9311|Tax payments
9399|Government services, not elsewhere classified
9402|Postal services: government only
9405|Intra-government purchases: government only
`;

export const MCC_LIST: ReadonlyArray<readonly [string, string]> = RAW.trim()
	.split('\n')
	.map((line) => {
		const i = line.indexOf('|');
		return [line.slice(0, i), line.slice(i + 1)] as const;
	});

export const MCC_BY_CODE: ReadonlyMap<string, string> = new Map(MCC_LIST);

export const CFI_CATEGORIES: Readonly<Record<string, string>> = {
	C: 'Collective investment vehicles',
	D: 'Debt instruments',
	E: 'Equities',
	F: 'Futures',
	H: 'Non-listed and complex listed options',
	I: 'Spot',
	J: 'Forwards',
	K: 'Strategies',
	L: 'Financing',
	M: 'Others (miscellaneous)',
	O: 'Listed options',
	R: 'Entitlements (rights)',
	S: 'Swaps',
	T: 'Referential instruments',
};

/** Group letters (2nd character) for the categories where the meaning is certain; others are shown as the letter only. */
export const CFI_GROUPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	E: { S: 'Common / ordinary shares', P: 'Preferred / preference shares', C: 'Common / ordinary convertible shares', F: 'Preferred / preference convertible shares', L: 'Limited partnership units', D: 'Depositary receipts on equities', Y: 'Structured instruments (participation)', M: 'Others (miscellaneous)' },
	D: { B: 'Bonds', C: 'Convertible bonds', W: 'Bonds with warrants attached', T: 'Medium-term notes', Y: 'Money market instruments', M: 'Others (miscellaneous)' },
	O: { C: 'Call options', P: 'Put options', M: 'Others (miscellaneous)' },
};
