import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import { Client, Message as WbotMessage, } from "whatsapp-web.js";
import User from "../../models/User";

interface Session extends Client {
  id?: number;
}
const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact,
  wbot?: Session,
  msg?: WbotMessage
): Promise<Ticket> => {


  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending"]
      },
      contactId: groupContact ? groupContact.id : contact.id,
      whatsappId: whatsappId
    }
  });

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  if (!ticket && groupContact) {
    ticket = await Ticket.findOne({
      where: {
        contactId: groupContact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });
    }
  }

  if (!ticket && !groupContact) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: {
          [Op.between]: [+subHours(new Date(), 2), +new Date()]
        },
        contactId: contact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });
    }
  }

  if (!ticket) {
    ticket = await Ticket.create({
      contactId: groupContact ? groupContact.id : contact.id,
      status: "pending",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });

  }

  if (!['1', '2', '3'].includes(msg?.body!) && ticket.userId == null) {
    // List of options
    const options = ['Soporte GPS 1', 'Ventas 2', 'Facturación y Cobranza 3'];

    // Format the options as a string
    const optionsString = options.map((option, index) => `${index + 1}. ${option}`).join('\n');

    // Construct the message
    const message = `Elija el numero correspondiente:\n${optionsString}`;
    console.log(message);

    wbot?.sendMessage(msg?.from!, message);
  } else {
    if (ticket.userId == null) {
      let conf: { [key: string]: { queue: number, users: Array<number> } } = {
        '1': {
          queue: 2,
          users: [4, 5, 6, 15]
        },
        '3': {
          queue: 4,
          users: [10]
        },
        '2': {
          queue: 5,
          users: [16]
        }
      }


      let t = await Ticket.findOne({ where: { queueId: conf[msg?.body!].queue }, order: [['id', 'DESC']] });
      console.log(conf[msg?.body!]);

      let currentIndex = 0;

      if (t) {
        currentIndex = conf[msg?.body!].users.indexOf(t.userId);;
      }
      console.log(currentIndex);

      let nextId = t?.userId;
      let nextUser = null;
      let actual = currentIndex;
      do {
        currentIndex = (currentIndex + 1) % conf[msg?.body!].users.length; // Move to the next index in a circular manner
        console.log(currentIndex);

        nextUser = conf[msg?.body!].users[currentIndex];

        let u = await User.findByPk(nextUser);
        // Check if the next user is working
        if (u && u.working) {
          await ticket.update({
            userId: u.id
          });
          break; // Exit the loop if a working user is found
        }


      } while (currentIndex !== actual);

      await ticket.update({
        queueId: conf[msg?.body!].queue,
      });
    }

  }

  ticket = await ShowTicketService(ticket.id);

  return ticket;
};

export default FindOrCreateTicketService;
